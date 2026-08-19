import type { Metadata } from "next";
import "./globals.css";
import AssetConnectionHints from "@/components/AssetConnectionHints";
import CookieNotice from "@/components/legal/CookieNotice";

export const metadata: Metadata = {
  title: "Радуйка — букеты, которые говорят за вас",
  description:
    "Авторские букеты, свежие цветы, доставка и самовывоз. Соберите свой букет онлайн.",
  icons: {
    icon: "https://raduyka-flowers.vercel.app/favicon.ico",
    shortcut: "https://raduyka-flowers.vercel.app/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body>
        <AssetConnectionHints />
        {children}
        <CookieNotice />
      </body>
    </html>
  );
}
