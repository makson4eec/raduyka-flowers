import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  getSupabasePublicConfig,
  supabaseServerCookieOptions,
} from "./config";

export async function updateSupabaseSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const config = getSupabasePublicConfig();

  if (!config) return response;

  const supabase = createServerClient(config.url, config.publicKey, {
    cookieOptions: supabaseServerCookieOptions,
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headersToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });

        response = NextResponse.next({ request });

        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });

        Object.entries(headersToSet ?? {}).forEach(([name, value]) => {
          response.headers.set(name, value);
        });
      },
    },
  });

  // Keep this call immediately after client creation: it both validates the
  // access token and refreshes an expired customer session when possible.
  try {
    await supabase.auth.getClaims();
  } catch {
    // A temporary Auth outage must not take down the public storefront.
  }

  return response;
}

export const updateSession = updateSupabaseSession;
