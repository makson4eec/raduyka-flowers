import type { CustomerAuthField, CustomerAuthState } from "@/app/(customer-auth)/actions";

export function AuthFeedback({ state }: { state: CustomerAuthState }) {
  if (!state.message) return null;

  return (
    <p
      className={`auth-message auth-message--${state.status}`}
      role={state.status === "error" ? "alert" : "status"}
    >
      {state.message}
    </p>
  );
}

export function AuthFieldError({
  field,
  state,
}: {
  field: CustomerAuthField;
  state: CustomerAuthState;
}) {
  const errors = state.fieldErrors?.[field];
  if (!errors?.length) return null;

  return (
    <span className="auth-field-error" id={`${field}-error`} role="alert">
      {errors[0]}
    </span>
  );
}
