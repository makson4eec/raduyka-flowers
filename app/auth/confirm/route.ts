import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type SupportedOtpType =
  | "email"
  | "recovery"
  | "invite"
  | "magiclink"
  | "signup"
  | "email_change";

const allowedOtpTypes = new Set<SupportedOtpType>([
  "email",
  "recovery",
  "invite",
  "magiclink",
  "signup",
  "email_change",
]);

function isSupportedOtpType(value: string | null): value is SupportedOtpType {
  return value !== null && allowedOtpTypes.has(value as SupportedOtpType);
}

function safeDestination(value: string | null, recovery: boolean) {
  if (recovery) return "/update-password";
  if (value === "/account" || value?.startsWith("/account?")) return value;
  if (value === "/update-password") return value;
  return "/account";
}

function loginErrorUrl(request: NextRequest, error: string) {
  const url = new URL("/login", request.url);
  url.searchParams.set("error", error);
  return url;
}

export async function GET(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.redirect(loginErrorUrl(request, "service-unavailable"), 303);
  }

  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const rawType = request.nextUrl.searchParams.get("type");
  const code = request.nextUrl.searchParams.get("code");
  const recovery = rawType === "recovery"
    || request.nextUrl.searchParams.get("next") === "/update-password";
  const destination = safeDestination(
    request.nextUrl.searchParams.get("next"),
    recovery,
  );

  try {
    if (tokenHash && isSupportedOtpType(rawType)) {
      const { error } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: rawType,
      });

      if (!error) {
        return NextResponse.redirect(new URL(destination, request.url), 303);
      }
    } else if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);

      if (!error) {
        return NextResponse.redirect(new URL(destination, request.url), 303);
      }
    }
  } catch {
    // Fall through to the same non-sensitive error shown for expired links.
  }

  return NextResponse.redirect(loginErrorUrl(request, "invalid-link"), 303);
}
