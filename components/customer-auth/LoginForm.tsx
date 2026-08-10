"use client";

import Link from "next/link";
import { useActionState } from "react";
import { loginAction, type CustomerAuthState } from "@/app/(customer-auth)/actions";
import { AuthFeedback, AuthFieldError } from "./AuthFeedback";

const initialState: CustomerAuthState = { status: "idle" };

export default function LoginForm({
  next = "/account",
  configured,
}: {
  next?: string;
  configured: boolean;
}) {
  const [state, formAction, pending] = useActionState(loginAction, initialState);

  return (
    <form className="auth-form" action={formAction} noValidate>
      <input type="hidden" name="next" value={next} />
      <AuthFeedback state={state} />

      <label className="auth-field">
        <span>Email</span>
        <input
          type="email"
          name="email"
          autoComplete="email"
          inputMode="email"
          required
          aria-invalid={Boolean(state.fieldErrors?.email)}
          aria-describedby={state.fieldErrors?.email ? "email-error" : undefined}
          placeholder="hello@example.ru"
        />
        <AuthFieldError field="email" state={state} />
      </label>

      <label className="auth-field">
        <span>Пароль</span>
        <input
          type="password"
          name="password"
          autoComplete="current-password"
          required
          aria-invalid={Boolean(state.fieldErrors?.password)}
          aria-describedby={state.fieldErrors?.password ? "password-error" : undefined}
        />
        <AuthFieldError field="password" state={state} />
      </label>

      <div className="auth-form-row">
        <Link href="/forgot-password">Забыли пароль?</Link>
      </div>

      <button
        className="button button--navy button--wide auth-submit"
        type="submit"
        disabled={pending || !configured}
      >
        {pending ? "Входим…" : "Войти"}
      </button>

      <p className="auth-links">
        Нет аккаунта? <Link href="/register">Зарегистрироваться</Link>
      </p>
    </form>
  );
}
