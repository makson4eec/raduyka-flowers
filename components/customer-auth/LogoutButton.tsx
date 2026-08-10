"use client";

import { useFormStatus } from "react-dom";
import { logoutAction } from "@/app/(customer-auth)/actions";

function LogoutSubmit() {
  const { pending } = useFormStatus();

  return (
    <button
      className="text-link customer-logout"
      type="submit"
      disabled={pending}
    >
      {pending ? "Выходим…" : "Выйти из аккаунта"}
    </button>
  );
}

export default function LogoutButton() {
  return (
    <form action={logoutAction}>
      <LogoutSubmit />
    </form>
  );
}
