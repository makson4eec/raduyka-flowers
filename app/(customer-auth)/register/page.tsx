import type { Metadata } from "next";
import { redirect } from "next/navigation";
import CustomerShell from "@/components/customer-auth/CustomerShell";
import RegisterForm from "@/components/customer-auth/RegisterForm";
import {
  isSupabaseConfigured,
  SUPABASE_NOT_CONFIGURED_MESSAGE,
} from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Регистрация — Радуйка",
  description: "Бесплатная регистрация в личном кабинете Радуйки.",
};

export default async function RegisterPage() {
  const configured = isSupabaseConfigured();
  const supabase = await createSupabaseServerClient();
  let authenticated = false;

  if (supabase) {
    try {
      const { data } = await supabase.auth.getClaims();
      authenticated = Boolean(data?.claims?.sub);
    } catch {
      // Let a visitor with an invalid old cookie create or enter an account.
    }
  }

  if (authenticated) redirect("/account");

  return (
    <CustomerShell
      eyebrow="Бесплатная регистрация"
      title="Создайте свой кабинет"
      description="Сохраняйте важные даты и получайте напоминания заранее. Телефон для регистрации не нужен."
      aside={
        <>
          <article><b>Важные даты</b><span>Дни рождения, годовщины и праздники в одном месте.</span></article>
          <article><b>Напоминания</b><span>Вы сами выбираете, за сколько дней напомнить.</span></article>
        </>
      }
    >
      {!configured && (
        <p className="auth-message auth-message--error" role="status">
          {SUPABASE_NOT_CONFIGURED_MESSAGE}
        </p>
      )}
      <RegisterForm configured={configured} />
    </CustomerShell>
  );
}
