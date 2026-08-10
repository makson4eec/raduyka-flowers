import type { Metadata } from "next";
import { redirect } from "next/navigation";
import CustomerShell from "@/components/customer-auth/CustomerShell";
import LoginForm from "@/components/customer-auth/LoginForm";
import {
  isSupabaseConfigured,
  SUPABASE_NOT_CONFIGURED_MESSAGE,
} from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Вход — Радуйка",
  description: "Вход в личный кабинет покупателя Радуйки.",
};

type LoginPageProps = {
  searchParams: Promise<{
    next?: string | string[];
    message?: string | string[];
    error?: string | string[];
  }>;
};

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function safeNext(value: string | undefined) {
  if (value === "/account" || value?.startsWith("/account?")) return value;
  return "/account";
}

function successMessage(value: string | undefined) {
  if (value === "password-updated") {
    return "Пароль обновлён. Теперь войдите с новым паролем.";
  }
  if (value === "signed-out") return "Вы вышли из аккаунта.";
  return null;
}

function errorMessage(value: string | undefined) {
  if (value === "invalid-link") {
    return "Ссылка недействительна или уже использована. Запросите новое письмо.";
  }
  if (value === "recovery-session") {
    return "Сессия восстановления закончилась. Запросите новую ссылку.";
  }
  if (value === "service-unavailable") return SUPABASE_NOT_CONFIGURED_MESSAGE;
  if (value === "auth-required") return "Сначала войдите в личный кабинет.";
  return null;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const configured = isSupabaseConfigured();
  const supabase = await createSupabaseServerClient();
  let authenticated = false;

  if (supabase) {
    try {
      const { data } = await supabase.auth.getClaims();
      authenticated = Boolean(data?.claims?.sub);
    } catch {
      // A stale or malformed cookie should not prevent the login form rendering.
    }
  }

  if (authenticated) redirect("/account");

  const success = successMessage(first(params.message));
  const error = errorMessage(first(params.error));

  return (
    <CustomerShell
      eyebrow="Личный кабинет"
      title="С возвращением"
      description="Войдите по email и паролю, чтобы увидеть важные даты и настройки уведомлений."
      aside={
        <>
          <article><b>Ваши даты</b><span>Хранятся в аккаунте, а не только на одном устройстве.</span></article>
          <article><b>Без SMS</b><span>Для входа нужен только email и пароль.</span></article>
        </>
      }
    >
      {!configured && (
        <p className="auth-message auth-message--error" role="status">
          {SUPABASE_NOT_CONFIGURED_MESSAGE}
        </p>
      )}
      {success && (
        <p className="auth-message auth-message--success" role="status">
          {success}
        </p>
      )}
      {error && (
        <p className="auth-message auth-message--error" role="alert">
          {error}
        </p>
      )}
      <LoginForm next={safeNext(first(params.next))} configured={configured} />
    </CustomerShell>
  );
}
