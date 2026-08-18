import { timingSafeEqual } from "node:crypto";
import {
  calendarDateInTimeZone,
  calendarDateToIso,
  getDueNotification,
} from "@/lib/reminders/date-math";
import { REMINDER_SELECT_COLUMNS, reminderRowToInput } from "@/lib/reminders/dto";
import type { ReminderRow } from "@/lib/reminders/types";
import { getFirebaseAdminMessaging } from "@/lib/firebase/admin";
import { sendFirebasePushToInstallations } from "@/lib/firebase/send";
import { getSupabaseServiceRoleClient } from "@/lib/firebase/supabase-admin";
import { configuredSiteOrigin } from "@/lib/site-url";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

type NotificationLogStatus = "sent" | "partial" | "failed";

type CronSummary = {
  date: string;
  remindersChecked: number;
  remindersDue: number;
  claimsCreated: number;
  duplicatesSkipped: number;
  notificationsSent: number;
  notificationFailures: number;
  invalidInstallationsRemoved: number;
  processingErrors: number;
};

function noStoreJson(body: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("Cache-Control", "no-store");
  return Response.json(body, { ...init, headers });
}

function isAuthorizedCronRequest(request: Request) {
  const secret = process.env.CRON_SECRET?.trim() ?? "";
  const authorization = request.headers.get("authorization") ?? "";
  if (secret.length < 16 || !authorization) return false;

  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(authorization);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function siteLink(request: Request) {
  const configuredBase = configuredSiteOrigin() ?? new URL(request.url).origin;
  return new URL("/", configuredBase).toString();
}

function notificationBody(title: string, offset: 0 | 1 | 3 | 7) {
  const eventTitle = title.trim().replace(/[.!?]+$/u, "");
  switch (offset) {
    case 7:
      return `Через 7 дней — ${eventTitle}. Это ваше сохранённое напоминание.`;
    case 3:
      return `Через 3 дня — ${eventTitle}. Это ваше сохранённое напоминание.`;
    case 1:
      return `Завтра — ${eventTitle}. Это ваше сохранённое напоминание.`;
    case 0:
      return `Сегодня — ${eventTitle}. Это ваше сохранённое напоминание.`;
  }
}

function compactErrorText(values: string[]) {
  const unique = [...new Set(values.filter(Boolean))];
  return unique.length > 0 ? unique.join(", ").slice(0, 2_000) : null;
}

export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return noStoreJson({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseServiceRoleClient();
  if (!supabase) {
    return noStoreJson(
      { ok: false, skipped: "supabase_service_role_not_configured" },
      { status: 503 },
    );
  }

  // Initialize before any claims are written. Missing or malformed Firebase
  // credentials must not consume this year's deduplication record.
  if (!getFirebaseAdminMessaging()) {
    return noStoreJson(
      { ok: false, skipped: "firebase_admin_not_configured" },
      { status: 503 },
    );
  }

  const reminderTimeZone = process.env.REMINDER_TIME_ZONE?.trim() || "Asia/Yekaterinburg";
  let today: ReturnType<typeof calendarDateInTimeZone>;
  try {
    today = calendarDateInTimeZone(new Date(), reminderTimeZone);
  } catch {
    return noStoreJson(
      { ok: false, error: "invalid_reminder_time_zone" },
      { status: 500 },
    );
  }
  const todayIso = calendarDateToIso(today);
  const summary: CronSummary = {
    date: todayIso,
    remindersChecked: 0,
    remindersDue: 0,
    claimsCreated: 0,
    duplicatesSkipped: 0,
    notificationsSent: 0,
    notificationFailures: 0,
    invalidInstallationsRemoved: 0,
    processingErrors: 0,
  };

  const reminders: ReminderRow[] = [];
  const pageSize = 500;
  for (let from = 0; ; from += pageSize) {
    const { data: reminderData, error: remindersError } = await supabase
      .from("reminders")
      .select(REMINDER_SELECT_COLUMNS)
      .or(
        "notify_7_days.eq.true,notify_3_days.eq.true,notify_1_day.eq.true,notify_same_day.eq.true",
      )
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);

    if (remindersError) {
      return noStoreJson(
        { ok: false, error: "reminders_query_failed", code: remindersError.code },
        { status: 500 },
      );
    }

    const page = (reminderData ?? []) as ReminderRow[];
    reminders.push(...page);
    if (page.length < pageSize) break;
  }
  summary.remindersChecked = reminders.length;

  for (const reminder of reminders) {
    const due = getDueNotification(reminderRowToInput(reminder), today);
    if (!due) continue;
    summary.remindersDue += 1;

    // Do not consume the yearly deduplication key before the user has a
    // reachable device. This lets a later cron run deliver the reminder if
    // push is enabled on the same due date.
    const { data: subscriptions, error: subscriptionsError } = await supabase
      .from("push_subscriptions")
      .select("firebase_installation_id")
      .eq("user_id", reminder.user_id)
      .eq("is_active", true);

    if (subscriptionsError) {
      summary.processingErrors += 1;
      continue;
    }

    const installationIds = (subscriptions ?? [])
      .map((subscription) => subscription.firebase_installation_id)
      .filter(
        (installationId): installationId is string =>
          typeof installationId === "string" && installationId.length > 0,
      );

    if (installationIds.length === 0) continue;

    const eventDate = calendarDateToIso(due.eventDate);
    const claimedAt = new Date().toISOString();
    let { data: claim, error: claimError } = await supabase
      .from("notification_logs")
      .insert({
        user_id: reminder.user_id,
        reminder_id: reminder.id,
        notification_type: due.offset,
        event_year: due.eventDate.year,
        event_date: eventDate,
        status: "processing",
        claimed_at: claimedAt,
      })
      .select("id")
      .single();

    if (claimError?.code === "23505") {
      // A previous total delivery failure should be retryable on the same due
      // date. We also recover a processing claim left behind by a crashed cron
      // after a short timeout. Sent/partial notifications stay deduplicated so
      // users never receive a duplicate on devices that already succeeded.
      const { data: existingClaim, error: existingClaimError } = await supabase
        .from("notification_logs")
        .select("id, status, claimed_at")
        .eq("reminder_id", reminder.id)
        .eq("notification_type", due.offset)
        .eq("event_year", due.eventDate.year)
        .maybeSingle();

      if (existingClaimError || !existingClaim) {
        summary.processingErrors += 1;
        continue;
      }

      const staleBefore = new Date(Date.now() - 15 * 60_000).toISOString();
      const canRetryFailed = existingClaim.status === "failed";
      const canRecoverStale =
        existingClaim.status === "processing"
        && typeof existingClaim.claimed_at === "string"
        && existingClaim.claimed_at < staleBefore;

      if (!canRetryFailed && !canRecoverStale) {
        summary.duplicatesSkipped += 1;
        continue;
      }

      let reclaimQuery = supabase
        .from("notification_logs")
        .update({
          status: "processing",
          claimed_at: claimedAt,
          sent_at: null,
          success_count: 0,
          failure_count: 0,
          error_text: null,
        })
        .eq("id", existingClaim.id)
        .eq("status", existingClaim.status);

      if (canRecoverStale) {
        reclaimQuery = reclaimQuery.lt("claimed_at", staleBefore);
      }

      const { data: reclaimed, error: reclaimError } = await reclaimQuery
        .select("id")
        .maybeSingle();

      if (reclaimError) {
        summary.processingErrors += 1;
        continue;
      }

      if (!reclaimed) {
        summary.duplicatesSkipped += 1;
        continue;
      }

      claim = reclaimed;
      claimError = null;
    }

    if (claimError || !claim) {
      summary.processingErrors += 1;
      continue;
    }
    summary.claimsCreated += 1;

    const finishClaim = async (
      status: NotificationLogStatus,
      successCount: number,
      failureCount: number,
      errorText: string | null,
    ) => {
      const { error } = await supabase
        .from("notification_logs")
        .update({
          status,
          sent_at: successCount > 0 ? new Date().toISOString() : null,
          success_count: successCount,
          failure_count: failureCount,
          error_text: errorText,
        })
        .eq("id", claim.id)
        .eq("status", "processing");
      if (error) summary.processingErrors += 1;
    };

    const sendResult = await sendFirebasePushToInstallations({
      installationIds,
      title: "🌷 Радуйка",
      body: notificationBody(reminder.title, due.offset),
      link: siteLink(request),
      data: {
        reminderId: reminder.id,
        notificationOffset: String(due.offset),
        eventDate,
      },
    });

    summary.notificationsSent += sendResult.successCount;
    summary.notificationFailures += sendResult.failureCount;

    const cleanupErrors: string[] = [];
    if (sendResult.invalidInstallationIds.length > 0) {
      const { error: cleanupError } = await supabase
        .from("push_subscriptions")
        .delete()
        .eq("user_id", reminder.user_id)
        .in(
          "firebase_installation_id",
          sendResult.invalidInstallationIds,
        );

      if (cleanupError) {
        cleanupErrors.push(`invalid_cleanup:${cleanupError.code}`);
        summary.processingErrors += 1;
      } else {
        summary.invalidInstallationsRemoved +=
          sendResult.invalidInstallationIds.length;
      }
    }

    const status: NotificationLogStatus =
      sendResult.successCount === 0
        ? "failed"
        : sendResult.failureCount > 0
          ? "partial"
          : "sent";
    const failureCodes = sendResult.failures.map((failure) => failure.code);
    await finishClaim(
      status,
      sendResult.successCount,
      sendResult.failureCount,
      compactErrorText([
        ...failureCodes,
        ...sendResult.batchErrors,
        ...cleanupErrors,
      ]),
    );
  }

  return noStoreJson({ ok: true, ...summary });
}
