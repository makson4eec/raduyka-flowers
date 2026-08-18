import Link from "next/link";
import type { ReactNode } from "react";
import "./legal.css";

export default function LegalLayout({ children }: { children: ReactNode }) {
  return (
    <div className="legal-shell">
      <nav className="legal-nav" aria-label="Юридические документы">
        <Link className="legal-nav__brand" href="/">РАДУЙКА</Link>
        <Link href="/legal/seller">Продавец</Link>
        <Link href="/legal/offer">Оферта</Link>
        <Link href="/legal/payment-delivery">Оплата и доставка</Link>
        <Link href="/legal/bonus-program">Бонусы</Link>
        <Link href="/legal/returns-claims">Возврат и претензии</Link>
        <Link href="/legal/privacy">Персональные данные</Link>
        <Link href="/legal/cookies">Cookies</Link>
      </nav>
      {children}
    </div>
  );
}
