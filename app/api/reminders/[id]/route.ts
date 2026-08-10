import {
  REMINDER_SELECT_COLUMNS,
  reminderInputToMutationRow,
  reminderRowToDto,
  reminderRowToInput,
} from "@/lib/reminders/dto";
import {
  authenticateReminderRequest,
  reminderError,
  reminderJson,
} from "@/lib/reminders/http";
import type {
  ReminderInput,
  ReminderPatch,
  ReminderRow,
} from "@/lib/reminders/types";
import {
  reminderCreateSchema,
  reminderIdSchema,
  reminderPatchSchema,
  reminderValidationError,
} from "@/lib/reminders/validation";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  consumeIdentifierRateLimit,
  HttpSecurityError,
  isSameOriginMutation,
  rateLimitHeaders,
  readJsonBody,
} from "@/lib/http-security";

export const dynamic = "force-dynamic";

type Context = {
  params: Promise<{ id: string }>;
};

async function readOwnedReminder(
  id: string,
  userId: string,
  supabase: SupabaseClient,
) {
  return supabase
    .from("reminders")
    .select(REMINDER_SELECT_COLUMNS)
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
}

export async function PATCH(request: Request, context: Context) {
  const auth = await authenticateReminderRequest();
  if (!auth.ok) return auth.response;

  if (!request.headers.get("origin") || !isSameOriginMutation(request)) {
    return reminderError("Недопустимый источник запроса.", 403);
  }
  const rateLimit = consumeIdentifierRateLimit(
    "reminder-mutation",
    auth.userId,
    120,
    60 * 60_000,
  );
  if (!rateLimit.allowed) {
    return reminderJson(
      { error: "Слишком много изменений. Попробуйте позже." },
      429,
      rateLimitHeaders(rateLimit),
    );
  }

  const parsedId = reminderIdSchema.safeParse((await context.params).id);
  if (!parsedId.success) {
    return reminderJson(reminderValidationError(parsedId.error), 400);
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

  const parsedPatch = reminderPatchSchema.safeParse(payload);
  if (!parsedPatch.success) {
    return reminderJson(reminderValidationError(parsedPatch.error), 400);
  }

  const currentResult = await readOwnedReminder(
    parsedId.data,
    auth.userId,
    auth.supabase,
  );

  if (currentResult.error) {
    console.error("Failed to read reminder before update", {
      code: currentResult.error.code,
      message: currentResult.error.message,
    });
    return reminderError("Не удалось загрузить важную дату.", 500);
  }

  if (!currentResult.data) {
    return reminderError("Важная дата не найдена.", 404);
  }

  const current = reminderRowToInput(currentResult.data as ReminderRow);
  const patch: ReminderPatch = parsedPatch.data;
  const merged = reminderCreateSchema.safeParse({
    ...current,
    ...patch,
  });

  if (!merged.success) {
    return reminderJson(reminderValidationError(merged.error), 400);
  }

  const input: ReminderInput = merged.data;
  const { data, error } = await auth.supabase
    .from("reminders")
    .update(reminderInputToMutationRow(input))
    .eq("id", parsedId.data)
    .eq("user_id", auth.userId)
    .select(REMINDER_SELECT_COLUMNS)
    .maybeSingle();

  if (error) {
    console.error("Failed to update reminder", {
      code: error.code,
      message: error.message,
    });
    return reminderError("Не удалось сохранить дату.", 500);
  }

  if (!data) {
    return reminderError("Важная дата не найдена.", 404);
  }

  return reminderJson({ reminder: reminderRowToDto(data as ReminderRow) });
}

export async function DELETE(request: Request, context: Context) {
  const auth = await authenticateReminderRequest();
  if (!auth.ok) return auth.response;

  if (!request.headers.get("origin") || !isSameOriginMutation(request)) {
    return reminderError("Недопустимый источник запроса.", 403);
  }
  const rateLimit = consumeIdentifierRateLimit(
    "reminder-mutation",
    auth.userId,
    120,
    60 * 60_000,
  );
  if (!rateLimit.allowed) {
    return reminderJson(
      { error: "Слишком много изменений. Попробуйте позже." },
      429,
      rateLimitHeaders(rateLimit),
    );
  }

  const parsedId = reminderIdSchema.safeParse((await context.params).id);
  if (!parsedId.success) {
    return reminderJson(reminderValidationError(parsedId.error), 400);
  }

  const { data, error } = await auth.supabase
    .from("reminders")
    .delete()
    .eq("id", parsedId.data)
    .eq("user_id", auth.userId)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("Failed to delete reminder", {
      code: error.code,
      message: error.message,
    });
    return reminderError("Не удалось удалить дату.", 500);
  }

  if (!data) {
    return reminderError("Важная дата не найдена.", 404);
  }

  return reminderJson({ ok: true });
}
