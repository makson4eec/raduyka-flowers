import type { Metadata } from "next";
import CustomerShell from "@/components/customer-auth/CustomerShell";
import ForgotPasswordForm from "@/components/customer-auth/ForgotPasswordForm";
import {
  isSupabaseConfigured,
  SUPABASE_NOT_CONFIGURED_MESSAGE,
} from "@/lib/supabase/config";

export const metadata: Metadata = {
  title: "Восстановление пароля — Радуйка",
  description: "Получите ссылку для восстановления пароля Радуйки.",
};

export default function ForgotPasswordPage() {
  const configured = isSupabaseConfigured();

  return (
    <CustomerShell
      eyebrow="Восстановление доступа"
      title="Задайте новый пароль"
      description="Введите email аккаунта. Мы отправим одноразовую ссылку для безопасной смены пароля."
    >
      {!configured && (
        <p className="auth-message auth-message--error" role="status">
          {SUPABASE_NOT_CONFIGURED_MESSAGE}
        </p>
      )}
      <ForgotPasswordForm configured={configured} />
    </CustomerShell>
  );
}
