import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import {
  getSupabasePublicConfig,
  supabaseServerCookieOptions,
} from "./config";

export async function createSupabaseServerClient() {
  const config = getSupabasePublicConfig();
  if (!config) return null;

  const cookieStore = await cookies();

  return createServerClient(config.url, config.publicKey, {
    cookieOptions: supabaseServerCookieOptions,
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server Components can only read cookies. The root proxy refreshes
          // the session before rendering and writes renewed cookies instead.
        }
      },
    },
  });
}

export const createClient = createSupabaseServerClient;
