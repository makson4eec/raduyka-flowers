"use client";

import { useActionState } from "react";
import {
  updatePasswordAction,
  type CustomerAuthState,
} from "@/app/(customer-auth)/actions";
import { AuthFeedback, AuthFieldError } from "./AuthFeedback";

const initialState: CustomerAuthState = { status: "idle" };

export default function UpdatePasswordForm({ configured }: { configured: boolean }) {
  const [state, formAction, pending] = useActionState(
    updatePasswordAction,
    initialState,
  );

  return (
    <form className="auth-form" action={formAction} noValidate>
      <AuthFeedback state={state} />

      <label className="auth-field">
        <span>Новый пароль</span>
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
        <span>Повторите новый пароль</span>
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

      <button
        className="button button--navy button--wide auth-submit"
        type="submit"
        disabled={pending || !configured}
      >
        {pending ? "Сохраняем…" : "Сохранить новый пароль"}
      </button>
    </form>
  );
}
