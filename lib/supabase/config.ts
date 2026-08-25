export type SupabasePublicConfig = {
  url: string;
  publicKey: string;
};

export const SUPABASE_NOT_CONFIGURED_MESSAGE =
  "Личный кабинет пока не подключён. Добавьте настройки Supabase и перезапустите приложение.";

export const supabaseServerCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};

function clean(value: string | undefined) {
  return value?.trim() ?? "";
}

export function getSupabasePublicConfig(): SupabasePublicConfig | null {
  const url = clean(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const publicKey = clean(
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
      || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );

  if (!url || !publicKey) return null;

  try {
    const parsedUrl = new URL(url);
    if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") {
      return null;
    }
  } catch {
    return null;
  }

  return { url, publicKey };
}

export function isSupabaseConfigured() {
  return getSupabasePublicConfig() !== null;
}
