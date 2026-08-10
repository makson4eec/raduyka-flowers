import Link from "next/link";
import { redirect } from "next/navigation";
import AccountDashboard from "@/components/account/AccountDashboard";
import CustomerShell from "@/components/customer-auth/CustomerShell";
import { SUPABASE_NOT_CONFIGURED_MESSAGE } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type AccountPageProps = {
  searchParams: Promise<{ new?: string | string[] }>;
};

function readableName(value: unknown) {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, 100)
    : "Покупатель";
}

function readableBonusBalance(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.trunc(value))
    : null;
}

export default async function AccountPage({ searchParams }: AccountPageProps) {
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return (
      <CustomerShell
        eyebrow="Личный кабинет"
        title="Осталось подключить Supabase"
        description={SUPABASE_NOT_CONFIGURED_MESSAGE}
      >
        <p className="auth-message auth-message--error" role="alert">
          Обычный магазин продолжает работать. Заполните переменные из .env.example и перезапустите сервер разработки.
        </p>
        <div className="auth-links"><Link href="/">Вернуться в магазин</Link></div>
      </CustomerShell>
    );
  }

  const claimsResult = await supabase.auth.getClaims();
  const userId = claimsResult.data?.claims?.sub;
  if (claimsResult.error || !userId) redirect("/login?next=/account");

  const [{ data: userResult }, profileResult, query] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from("profiles").select("name, bonus_balance").eq("id", userId).maybeSingle(),
    searchParams,
  ]);

  const user = userResult.user;
  if (!user) redirect("/login?next=/account");

  const metadataName = (user.user_metadata as { name?: unknown } | null)?.name;
  const name = readableName(profileResult.data?.name ?? metadataName);
  const bonusBalance = readableBonusBalance(profileResult.data?.bonus_balance);
  const email = user.email ?? "Email не указан";
  const startWithNewReminder = query.new === "1";

  return (
    <div className="customer-shell account-shell">
      <header className="customer-header">
        <Link className="brand" href="/" aria-label="Радуйка — на главную">РАДУЙКА</Link>
        <Link className="auth-back-link" href="/">← Вернуться в магазин</Link>
      </header>
      <main className="account-main">
        <AccountDashboard
          name={name}
          email={email}
          bonusBalance={bonusBalance}
          startWithNewReminder={startWithNewReminder}
        />
      </main>
    </div>
  );
}
