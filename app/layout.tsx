import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Радуйка — букеты, которые говорят за вас",
  description:
    "Авторские букеты, свежие цветы, доставка и самовывоз. Соберите свой букет онлайн.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
