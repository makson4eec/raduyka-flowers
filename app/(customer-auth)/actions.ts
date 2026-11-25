"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  SUPABASE_NOT_CONFIGURED_MESSAGE,
} from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { configuredSiteOrigin, normalizeRequestOrigin } from "@/lib/site-url";
import { LEGAL_DOCUMENT_VERSION } from "@/lib/legal";
import { getSiteContent } from "@/lib/content-store";
import { getDocumentVersion } from "@/lib/document-version";

export type CustomerAuthField =
  | "name"
  | "email"
  | "password"
  | "passwordConfirmation"
  | "personalDataConsent";

export type CustomerAuthState = {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: Partial<Record<CustomerAuthField, string[]>>;
};

const emailField = z
  .string()
  .trim()
  .min(1, "Введите email")
  .email("Введите корректный email")
  .transform((value) => value.toLowerCase());

const passwordField = z
  .string()
  .min(8, "Пароль должен содержать не менее 8 символов")
  .max(128, "Пароль не должен быть длиннее 128 символов");

const registerSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, "Введите имя — не менее 2 символов")
      .max(100, "Имя не должно быть длиннее 100 символов"),
    email: emailField,
    password: passwordField,
    passwordConfirmation: z.string(),
    personalDataConsent: z.literal("on", {
      error: "Нужно дать отдельное согласие на обработку персональных данных",
    }),
  })
  .refine((value) => value.password === value.passwordConfirmation, {
    message: "Пароли не совпадают",
    path: ["passwordConfirmation"],
  });

const loginSchema = z.object({
  email: emailField,
  password: z.string().min(1, "Введите пароль"),
});

const resetRequestSchema = z.object({ email: emailField });

const updatePasswordSchema = z
  .object({
    password: passwordField,
    passwordConfirmation: z.string(),
  })
  .refine((value) => value.password === value.passwordConfirmation, {
    message: "Пароли не совпадают",
    path: ["passwordConfirmation"],
  });

function validationState(error: z.ZodError): CustomerAuthState {
  return {
    status: "error",
    message: "Проверьте заполненные поля",
    fieldErrors: error.flatten().fieldErrors as Partial<
      Record<CustomerAuthField, string[]>
    >,
  };
}

function errorState(message: string): CustomerAuthState {
  return { status: "error", message };
}

async function requestOrigin() {
  const configured = configuredSiteOrigin();
  if (configured) return configured;

  // In production, only explicit configuration or Vercel-provided deployment
  // metadata may be used for security-sensitive email links.
  if (process.env.NODE_ENV === "production") return null;

  const requestHeaders = await headers();
  const origin = normalizeRequestOrigin(requestHeaders.get("origin"));
  if (origin) return origin;

  const forwardedHost = requestHeaders.get("x-forwarded-host");
  const host = forwardedHost ?? requestHeaders.get("host");
  if (host) {
    const protocol = requestHeaders.get("x-forwarded-proto") ?? "http";
    const forwardedOrigin = normalizeRequestOrigin(`${protocol}://${host}`);
    if (forwardedOrigin) return forwardedOrigin;
  }

  return "http://localhost:3000";
}

function callbackUrl(origin: string, next: "/account" | "/update-password") {
  const url = new URL("/auth/confirm", origin);
  url.searchParams.set("next", next);
  return url.toString();
}

function safeAccountPath(value: FormDataEntryValue | null) {
  if (typeof value !== "string") return "/account";
  if (value === "/account" || value.startsWith("/account?")) return value;
  return "/account";
}

function readableAuthError(
  message: string,
  context: "register" | "login" | "reset" | "update",
) {
  const normalized = message.toLowerCase();

  if (normalized.includes("rate") || normalized.includes("too many")) {
    return "Слишком много попыток. Подождите немного и попробуйте снова.";
  }

  if (
    normalized.includes("fetch")
    || normalized.includes("network")
    || normalized.includes("failed to connect")
  ) {
    return "Не удалось связаться с сервисом входа. Попробуйте ещё раз чуть позже.";
  }

  if (context === "login") {
    if (normalized.includes("email not confirmed")) {
      return "Сначала подтвердите email по ссылке из письма.";
    }
    return "Неверный email или пароль.";
  }

  if (context === "register") {
    if (normalized.includes("already registered") || normalized.includes("already exists")) {
      return "Не удалось завершить регистрацию. Проверьте почту или попробуйте войти.";
    }
    if (normalized.includes("password")) {
      return "Supabase отклонил пароль. Используйте более надёжный пароль.";
    }
    return "Не удалось зарегистрироваться. Проверьте данные и попробуйте снова.";
  }

  if (context === "reset") {
    return "Не удалось отправить письмо. Подождите немного и попробуйте снова.";
  }

  return "Не удалось обновить пароль. Откройте свежую ссылку из письма и попробуйте снова.";
}

export async function registerAction(
  _previousState: CustomerAuthState,
  formData: FormData,
): Promise<CustomerAuthState> {
  const parsed = registerSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    passwordConfirmation: formData.get("passwordConfirmation"),
    personalDataConsent: formData.get("personalDataConsent"),
  });

  if (!parsed.success) return validationState(parsed.error);

  const supabase = await createSupabaseServerClient();
  if (!supabase) return errorState(SUPABASE_NOT_CONFIGURED_MESSAGE);

  const origin = await requestOrigin();
  if (!origin) {
    return errorState(
      "Регистрация временно недоступна: не настроен безопасный адрес сайта.",
    );
  }
  let result;

  try {
    result = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: {
        data: {
          name: parsed.data.name,
          personal_data_consent_version: getDocumentVersion(await getSiteContent(), "personal-data-consent", LEGAL_DOCUMENT_VERSION),
          personal_data_consent_at: new Date().toISOString(),
        },
        emailRedirectTo: callbackUrl(origin, "/account"),
      },
    });
  } catch {
    return errorState(
      "Не удалось связаться с сервисом регистрации. Попробуйте ещё раз чуть позже.",
    );
  }

  if (result.error) {
    return errorState(readableAuthError(result.error.message, "register"));
  }

  if (result.data.session) redirect("/account");

  return {
    status: "success",
    message:
      "Регистрация почти завершена. Откройте письмо от Радуйки и подтвердите email.",
  };
}

export async function loginAction(
  _previousState: CustomerAuthState,
  formData: FormData,
): Promise<CustomerAuthState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) return validationState(parsed.error);

  const supabase = await createSupabaseServerClient();
  if (!supabase) return errorState(SUPABASE_NOT_CONFIGURED_MESSAGE);

  let result;
  try {
    result = await supabase.auth.signInWithPassword(parsed.data);
  } catch {
    return errorState(
      "Не удалось связаться с сервисом входа. Попробуйте ещё раз чуть позже.",
    );
  }

  if (result.error) {
    return errorState(readableAuthError(result.error.message, "login"));
  }

  redirect(safeAccountPath(formData.get("next")));
}

export async function requestPasswordResetAction(
  _previousState: CustomerAuthState,
  formData: FormData,
): Promise<CustomerAuthState> {
  const parsed = resetRequestSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) return validationState(parsed.error);

  const supabase = await createSupabaseServerClient();
  if (!supabase) return errorState(SUPABASE_NOT_CONFIGURED_MESSAGE);

  const origin = await requestOrigin();
  if (!origin) {
    return errorState(
      "Сброс пароля временно недоступен: не настроен безопасный адрес сайта.",
    );
  }
  let result;

  try {
    result = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
      redirectTo: callbackUrl(origin, "/update-password"),
    });
  } catch {
    return errorState(
      "Не удалось отправить письмо. Проверьте подключение и попробуйте снова.",
    );
  }

  if (result.error) {
    return errorState(readableAuthError(result.error.message, "reset"));
  }

  return {
    status: "success",
    message:
      "Если аккаунт с таким email существует, мы отправили письмо со ссылкой для смены пароля.",
  };
}

export async function updatePasswordAction(
  _previousState: CustomerAuthState,
  formData: FormData,
): Promise<CustomerAuthState> {
  const parsed = updatePasswordSchema.safeParse({
    password: formData.get("password"),
    passwordConfirmation: formData.get("passwordConfirmation"),
  });

  if (!parsed.success) return validationState(parsed.error);

  const supabase = await createSupabaseServerClient();
  if (!supabase) return errorState(SUPABASE_NOT_CONFIGURED_MESSAGE);

  let claimsResult;
  try {
    claimsResult = await supabase.auth.getClaims();
  } catch {
    return errorState("Ссылка для смены пароля недействительна. Запросите новую.");
  }

  if (claimsResult.error || !claimsResult.data?.claims?.sub) {
    return errorState("Ссылка для смены пароля недействительна. Запросите новую.");
  }

  let result;
  try {
    result = await supabase.auth.updateUser({ password: parsed.data.password });
  } catch {
    return errorState(
      "Не удалось обновить пароль. Проверьте подключение и попробуйте снова.",
    );
  }

  if (result.error) {
    return errorState(readableAuthError(result.error.message, "update"));
  }

  await supabase.auth.signOut({ scope: "local" });
  redirect("/login?message=password-updated");
}

export async function logoutAction() {
  const supabase = await createSupabaseServerClient();

  if (supabase) {
    try {
      await supabase.auth.signOut({ scope: "local" });
    } catch {
      // Redirecting still replaces the protected account screen. A subsequent
      // server-side check will reject an invalid or expired customer session.
    }
  }

  redirect("/login?message=signed-out");
}
