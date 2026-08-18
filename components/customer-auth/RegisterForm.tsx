"use client";

import Link from "next/link";
import { useActionState } from "react";
import { registerAction, type CustomerAuthState } from "@/app/(customer-auth)/actions";
import { AuthFeedback, AuthFieldError } from "./AuthFeedback";

const initialState: CustomerAuthState = { status: "idle" };

export default function RegisterForm({ configured }: { configured: boolean }) {
  const [state, formAction, pending] = useActionState(registerAction, initialState);

  if (state.status === "success") {
    return (
      <div className="auth-result">
        <AuthFeedback state={state} />
        <Link className="button button--light button--wide" href="/login">
          Перейти ко входу
        </Link>
      </div>
    );
  }

  return (
    <form className="auth-form" action={formAction} noValidate>
      <AuthFeedback state={state} />

      <label className="auth-field">
        <span>Имя</span>
        <input
          type="text"
          name="name"
          autoComplete="name"
          required
          maxLength={100}
          aria-invalid={Boolean(state.fieldErrors?.name)}
          aria-describedby={state.fieldErrors?.name ? "name-error" : undefined}
          placeholder="Как к вам обращаться"
        />
        <AuthFieldError field="name" state={state} />
      </label>

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
          autoComplete="new-password"
          required
          minLength={8}
          maxLength={128}
          aria-invalid={Boolean(state.fieldErrors?.password)}
          aria-describedby={state.fieldErrors?.password ? "password-error" : undefined}
        />
        <small>Не менее 8 символов</small>
        <AuthFieldError field="password" state={state} />
      </label>

      <label className="auth-field">
        <span>Повторите пароль</span>
        <input
          type="password"
          name="passwordConfirmation"
          autoComplete="new-password"
          required
          minLength={8}
          maxLength={128}
          aria-invalid={Boolean(state.fieldErrors?.passwordConfirmation)}
          aria-describedby={
            state.fieldErrors?.passwordConfirmation
              ? "passwordConfirmation-error"
              : undefined
          }
        />
        <AuthFieldError field="passwordConfirmation" state={state} />
      </label>

      <label className="legal-checkbox">
        <input
          type="checkbox"
          name="personalDataConsent"
          required
          aria-invalid={Boolean(state.fieldErrors?.personalDataConsent)}
        />
        <span>
          Я даю отдельное <Link href="/legal/personal-data-consent" target="_blank" rel="noopener noreferrer">согласие на обработку персональных данных для создания и работы личного кабинета</Link> и ознакомился(ась) с <Link href="/legal/privacy" target="_blank" rel="noopener noreferrer">Политикой обработки персональных данных</Link>.
        </span>
      </label>
      <AuthFieldError field="personalDataConsent" state={state} />

      <button
        className="button button--navy button--wide auth-submit"
        type="submit"
        disabled={pending || !configured}
      >
        {pending ? "Создаём аккаунт…" : "Зарегистрироваться"}
      </button>
      <p className="auth-links">
        Уже есть аккаунт? <Link href="/login">Войти</Link>
      </p>
    </form>
  );
}
