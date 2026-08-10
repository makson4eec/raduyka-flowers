import {
  REMINDER_SELECT_COLUMNS,
  reminderInputToInsertRow,
  reminderRowToDto,
} from "@/lib/reminders/dto";
import {
  authenticateReminderRequest,
  reminderError,
  reminderJson,
} from "@/lib/reminders/http";
import type { ReminderInput, ReminderRow } from "@/lib/reminders/types";
import {
  reminderCreateSchema,
  reminderValidationError,
} from "@/lib/reminders/validation";
import {
  consumeIdentifierRateLimit,
  HttpSecurityError,
  isSameOriginMutation,
  rateLimitHeaders,
  readJsonBody,
} from "@/lib/http-security";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await authenticateReminderRequest();
  if (!auth.ok) return auth.response;

  const { data, error } = await auth.supabase
    .from("reminders")
    .select(REMINDER_SELECT_COLUMNS)
    .eq("user_id", auth.userId)
    .order("event_month", { ascending: true })
    .order("event_day", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Failed to list reminders", {
      code: error.code,
      message: error.message,
    });
    return reminderError("Не удалось загрузить важные даты.", 500);
  }

  const reminders = (data ?? []).map((row) =>
    reminderRowToDto(row as ReminderRow));

  return reminderJson({ reminders });
}

export async function POST(request: Request) {
  const auth = await authenticateReminderRequest();
  if (!auth.ok) return auth.response;

  if (!request.headers.get("origin") || !isSameOriginMutation(request)) {
    return reminderError("Недопустимый источник запроса.", 403);
  }

  const rateLimit = consumeIdentifierRateLimit(
    "reminder-create",
    auth.userId,
    30,
    60 * 60_000,
  );
  if (!rateLimit.allowed) {
    return reminderJson(
      { error: "Слишком много изменений. Попробуйте позже." },
      429,
      rateLimitHeaders(rateLimit),
    );
  }

  let payload: unknown;
  try {
    payload = await readJsonBody(request, 8 * 1_024);
  } catch (error) {
    if (error instanceof HttpSecurityError) {
      return reminderError(error.message, error.status);
    }
    return reminderError("Отправлены некорректные данные.", 400);
  }

  const parsed = reminderCreateSchema.safeParse(payload);
  if (!parsed.success) {
    return reminderJson(reminderValidationError(parsed.error), 400);
  }

  const input: ReminderInput = parsed.data;
  const { data, error } = await auth.supabase
    .from("reminders")
    .insert(reminderInputToInsertRow(input, auth.userId))
    .select(REMINDER_SELECT_COLUMNS)
    .single();

  if (error || !data) {
    console.error("Failed to create reminder", {
      code: error?.code,
      message: error?.message,
    });
    if (error?.code === "23514") {
      return reminderError("Можно сохранить не более 100 важных дат.", 409);
    }
    return reminderError("Не удалось сохранить дату.", 500);
  }

  const reminder = reminderRowToDto(data as ReminderRow);
  return reminderJson(
    { reminder },
    201,
    { Location: `/api/reminders/${reminder.id}` },
  );
}
