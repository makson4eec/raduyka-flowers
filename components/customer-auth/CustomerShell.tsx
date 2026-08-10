import Link from "next/link";
import type { ReactNode } from "react";

type CustomerShellProps = {
  eyebrow: string;
  title: ReactNode;
  description: string;
  children: ReactNode;
  aside?: ReactNode;
};

export default function CustomerShell({
  eyebrow,
  title,
  description,
  children,
  aside,
}: CustomerShellProps) {
  return (
    <div className="customer-shell">
      <header className="customer-header">
        <Link className="brand" href="/" aria-label="Радуйка — на главную">
          РАДУЙКА
        </Link>
        <Link className="auth-back-link" href="/">
          ← Вернуться в магазин
        </Link>
      </header>

      <main className="auth-main">
        <section className="auth-card">
          <p className="eyebrow">{eyebrow}</p>
          <h1>{title}</h1>
          <p className="auth-description">{description}</p>
          {children}
        </section>
        {aside && <aside className="auth-aside">{aside}</aside>}
      </main>
    </div>
  );
}
