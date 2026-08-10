import {
  consumeIdentifierRateLimit,
  HttpSecurityError,
  isSameOriginMutation,
  noStoreJson,
  rateLimitHeaders,
  readJsonBody,
} from "@/lib/http-security";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const INSTALLATION_ID_PATTERN = /^[A-Za-z0-9_-]{10,255}$/;
const MAX_DEVICES_PER_USER = 5;

async function authenticatedUser() {
  const client = await createSupabaseServerClient();
  if (!client) {
    return {
      error: noStoreJson(
        { error: "Личный кабинет пока не настроен." },
        { status: 503 },
      ),
    } as const;
  }

  const {
    data: { user },
    error,
  } = await client.auth.getUser();

  if (error || !user) {
    return {
      error: noStoreJson(
        { error: "Сначала войдите в личный кабинет." },
        { status: 401 },
      ),
    } as const;
  }

  return { userId: user.id, client } as const;
}

async function installationIdFromRequest(request: Request) {
  const payload = await readJsonBody(request, 2 * 1_024) as
    | { installationId?: unknown }
    | null;
  const installationId =
    typeof payload?.installationId === "string"
      ? payload.installationId.trim()
      : "";

  if (!INSTALLATION_ID_PATTERN.test(installationId)) {
    throw new HttpSecurityError(
      400,
      "Firebase вернул некорректный идентификатор устройства.",
    );
  }
  return installationId;
}

function validateMutation(request: Request) {
  return Boolean(request.headers.get("origin")) && isSameOriginMutation(request);
}

export async function GET() {
  const auth = await authenticatedUser();
  if ("error" in auth) return auth.error;

  const { count, error } = await auth.client
    .from("push_subscriptions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", auth.userId)
    .eq("is_active", true);

  if (error) {
    console.error("Failed to count push subscriptions", {
      userId: auth.userId,
      code: error.code,
    });
    return noStoreJson(
      { error: "Не удалось загрузить настройки уведомлений." },
      { status: 500 },
    );
  }

  const deviceCount = Math.max(0, count ?? 0);
  return noStoreJson({
    enabled: deviceCount > 0,
    deviceCount,
  });
}

export async function POST(request: Request) {
  if (!validateMutation(request)) {
    return noStoreJson(
      { error: "Недопустимый источник запроса." },
      { status: 403 },
    );
  }

  const auth = await authenticatedUser();
  if ("error" in auth) return auth.error;

  const rateLimit = consumeIdentifierRateLimit(
    "push-subscription-mutation",
    auth.userId,
    20,
    60 * 60_000,
  );
  if (!rateLimit.allowed) {
    return noStoreJson(
      { error: "Слишком много изменений. Попробуйте позже." },
      { status: 429, headers: rateLimitHeaders(rateLimit) },
    );
  }

  let installationId: string;
  try {
    installationId = await installationIdFromRequest(request);
  } catch (error) {
    if (error instanceof HttpSecurityError) {
      return noStoreJson({ error: error.message }, { status: error.status });
    }
    return noStoreJson({ error: "Некорректный запрос." }, { status: 400 });
  }

  const [
    { data: existing, error: existingError },
    { count, error: countError },
  ] = await Promise.all([
    auth.client
      .from("push_subscriptions")
      .select("id")
      .eq("user_id", auth.userId)
      .eq("firebase_installation_id", installationId)
      .maybeSingle(),
    auth.client
      .from("push_subscriptions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", auth.userId),
  ]);

  if (existingError || countError) {
    console.error("Failed to inspect push subscriptions", {
      userId: auth.userId,
      code: existingError?.code ?? countError?.code,
    });
    return noStoreJson(
      { error: "Не удалось проверить устройства пользователя." },
      { status: 500 },
    );
  }
  if (!existing && (count ?? 0) >= MAX_DEVICES_PER_USER) {
    return noStoreJson(
      { error: `Можно подключить не более ${MAX_DEVICES_PER_USER} устройств.` },
      { status: 409 },
    );
  }

  const now = new Date().toISOString();
  const mutableFields = {
    user_agent: request.headers.get("user-agent")?.slice(0, 500) || null,
    is_active: true,
    last_seen_at: now,
  };
  const mutation = existing
    ? await auth.client
      .from("push_subscriptions")
      .update(mutableFields)
      .eq("id", existing.id)
      .eq("user_id", auth.userId)
    : await auth.client
      .from("push_subscriptions")
      .insert({
        ...mutableFields,
        user_id: auth.userId,
        firebase_installation_id: installationId,
      });
  const { error } = mutation;

  if (error) {
    console.error("Failed to save push subscription", {
      userId: auth.userId,
      code: error.code,
    });
    const quotaExceeded = error.code === "23514";
    const conflict = ["23505", "23514", "42501"].includes(error.code);
    return noStoreJson(
      {
        error: conflict
          ? quotaExceeded
            ? `Можно подключить не более ${MAX_DEVICES_PER_USER} устройств.`
            : "Это устройство уже связано с другим аккаунтом. Сначала отключите уведомления в нём."
          : "Не удалось сохранить push-подписку устройства.",
      },
      { status: conflict ? 409 : 500 },
    );
  }

  return noStoreJson({ enabled: true, updatedAt: now }, { status: 201 });
}

export async function DELETE(request: Request) {
  if (!validateMutation(request)) {
    return noStoreJson(
      { error: "Недопустимый источник запроса." },
      { status: 403 },
    );
  }

  const auth = await authenticatedUser();
  if ("error" in auth) return auth.error;

  const rateLimit = consumeIdentifierRateLimit(
    "push-subscription-mutation",
    auth.userId,
    20,
    60 * 60_000,
  );
  if (!rateLimit.allowed) {
    return noStoreJson(
      { error: "Слишком много изменений. Попробуйте позже." },
      { status: 429, headers: rateLimitHeaders(rateLimit) },
    );
  }

  let installationId: string;
  try {
    installationId = await installationIdFromRequest(request);
  } catch (error) {
    if (error instanceof HttpSecurityError) {
      return noStoreJson({ error: error.message }, { status: error.status });
    }
    return noStoreJson({ error: "Некорректный запрос." }, { status: 400 });
  }

  const { error } = await auth.client
    .from("push_subscriptions")
    .delete()
    .eq("user_id", auth.userId)
    .eq("firebase_installation_id", installationId);

  if (error) {
    console.error("Failed to remove push subscription", {
      userId: auth.userId,
      code: error.code,
    });
    return noStoreJson(
      { error: "Не удалось отключить push-уведомления." },
      { status: 500 },
    );
  }

  return noStoreJson({ enabled: false });
}
