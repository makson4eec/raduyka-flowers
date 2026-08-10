import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const PRIVATE_NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  Pragma: "no-cache",
  Expires: "0",
  Vary: "Cookie",
};

export function reminderJson(
  body: unknown,
  status = 200,
  headers?: HeadersInit,
): Response {
  const responseHeaders = new Headers(PRIVATE_NO_STORE_HEADERS);
  if (headers) {
    new Headers(headers).forEach((value, key) => {
      responseHeaders.set(key, value);
    });
  }

  return Response.json(body, {
    status,
    headers: responseHeaders,
  });
}

export function reminderError(error: string, status: number): Response {
  return reminderJson({ error }, status);
}

type AuthenticatedReminderRequest = {
  ok: true;
  supabase: SupabaseClient;
  userId: string;
};

type RejectedReminderRequest = {
  ok: false;
  response: Response;
};

export async function authenticateReminderRequest(): Promise<
  AuthenticatedReminderRequest | RejectedReminderRequest
> {
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return {
      ok: false,
      response: reminderError(
        "Сервис личного кабинета пока не настроен.",
        503,
      ),
    };
  }

  try {
    const { data, error } = await supabase.auth.getClaims();
    const userId = data?.claims?.sub;

    if (error || typeof userId !== "string" || !userId) {
      return {
        ok: false,
        response: reminderError(
          "Сессия завершилась. Войдите в аккаунт снова.",
          401,
        ),
      };
    }

    return {
      ok: true,
      supabase,
      userId,
    };
  } catch {
    return {
      ok: false,
      response: reminderError(
        "Не удалось проверить авторизацию. Попробуйте ещё раз.",
        503,
      ),
    };
  }
}
