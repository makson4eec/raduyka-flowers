"use client";

import Link from "next/link";
import { useActionState } from "react";
import {
  requestPasswordResetAction,
  type CustomerAuthState,
} from "@/app/(customer-auth)/actions";
import { AuthFeedback, AuthFieldError } from "./AuthFeedback";

const initialState: CustomerAuthState = { status: "idle" };

export default function ForgotPasswordForm({
  configured,
}: {
  configured: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    requestPasswordResetAction,
    initialState,
  );

  if (state.status === "success") {
    return (
      <div className="auth-result">
        <AuthFeedback state={state} />
        <Link className="button button--light button--wide" href="/login">
          Вернуться ко входу
        </Link>
      </div>
    );
  }

  return (
    <form className="auth-form" action={formAction} noValidate>
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

      <button
        className="button button--navy button--wide auth-submit"
        type="submit"
        disabled={pending || !configured}
      >
        {pending ? "Отправляем…" : "Получить ссылку"}
      </button>

      <p className="auth-links">
        Вспомнили пароль? <Link href="/login">Вернуться ко входу</Link>
      </p>
    </form>
  );
}
