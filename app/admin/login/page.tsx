import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ADMIN_PASSWORD_MIN_LENGTH,
  adminConfigurationIssues,
  isAdmin,
  passwordIsConfigured,
} from "../../../lib/admin-auth";
import "../admin.css";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ error?: string }>;
};

export default async function AdminLoginPage({ searchParams }: Props) {
  if (await isAdmin()) redirect("/admin");

  const { error } = await searchParams;
  const configured = passwordIsConfigured();
  const configurationIssues = adminConfigurationIssues();

  return (
    <main className="admin-denied">
      <div className="admin-login-card">
        <p>РАДУЙКА</p>
        <h1>Вход в панель</h1>
        <span>Введите пароль владельца магазина.</span>

        {!configured && (
          <strong className="admin-login-setup" role="status">
            Защищённый вход ещё не настроен. Проверьте <code>.env.local</code>:
            {configurationIssues.map((issue) => <code key={issue}>{issue}</code>)}
          </strong>
        )}

        {error === "password" && (
          <strong className="admin-login-error" role="alert">
            Пароль не подошёл. Проверь раскладку и попробуй ещё раз.
          </strong>
        )}

        {error === "rate-limit" && (
          <strong className="admin-login-error" role="alert">
            Слишком много попыток входа. Подождите 15 минут и попробуйте снова.
          </strong>
        )}

        {error === "configuration" && (
          <strong className="admin-login-error" role="alert">
            Не удалось создать защищённую сессию. Проверьте настройки входа.
          </strong>
        )}

        <form action="/api/admin/login" method="post">
          <label>
            Пароль
            <input
              type="password"
              name="password"
              minLength={ADMIN_PASSWORD_MIN_LENGTH}
              maxLength={256}
              required
              autoComplete="current-password"
              disabled={!configured}
            />
          </label>
          <button type="submit" disabled={!configured}>Войти</button>
        </form>

        <Link href="/">← Вернуться в магазин</Link>
      </div>
    </main>
  );
}
