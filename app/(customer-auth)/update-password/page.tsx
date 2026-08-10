import type { Metadata } from "next";
import { redirect } from "next/navigation";
import CustomerShell from "@/components/customer-auth/CustomerShell";
import UpdatePasswordForm from "@/components/customer-auth/UpdatePasswordForm";
import {
  isSupabaseConfigured,
  SUPABASE_NOT_CONFIGURED_MESSAGE,
} from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Новый пароль — Радуйка",
  description: "Создайте новый пароль для личного кабинета Радуйки.",
};

export default async function UpdatePasswordPage() {
  const configured = isSupabaseConfigured();
  const supabase = await createSupabaseServerClient();
  let hasValidSession = false;

  if (configured && supabase) {
    try {
      const { data, error } = await supabase.auth.getClaims();
      hasValidSession = !error && Boolean(data?.claims?.sub);
    } catch {
      hasValidSession = false;
    }
  }

  if (configured && !hasValidSession) {
    redirect("/login?error=recovery-session");
  }

  return (
    <CustomerShell
      eyebrow="Новый пароль"
      title="Почти готово"
      description="Придумайте новый пароль. После сохранения нужно будет войти в аккаунт ещё раз."
    >
      {!configured && (
        <p className="auth-message auth-message--error" role="status">
          {SUPABASE_NOT_CONFIGURED_MESSAGE}
        </p>
      )}
      <UpdatePasswordForm configured={configured} />
    </CustomerShell>
  );
}
