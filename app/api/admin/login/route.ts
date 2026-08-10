import { NextResponse } from "next/server";
import {
  ADMIN_COOKIE,
  ADMIN_SESSION_TTL_SECONDS,
  createAdminSessionToken,
  passwordIsConfigured,
  passwordIsValid,
} from "../../../../lib/admin-auth";
import {
  assertMediaType,
  assertRequestSize,
  assertSameOriginMutation,
  clearRequestRateLimit,
  consumeRequestRateLimit,
  rateLimitHeaders,
  securityErrorResponse,
} from "../../../../lib/http-security";

export const runtime = "nodejs";

const LOGIN_RATE_LIMIT_SCOPE = "admin-login";

function redirectToLogin(request: Request, error: string, headers?: Headers) {
  const loginUrl = new URL("/admin/login", request.url);
  loginUrl.searchParams.set("error", error);
  const response = NextResponse.redirect(loginUrl, 303);
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  headers?.forEach((value, key) => response.headers.set(key, value));
  return response;
}

export async function POST(request: Request) {
  try {
    assertSameOriginMutation(request);
    assertMediaType(request, [
      "application/x-www-form-urlencoded",
      "multipart/form-data",
    ]);
    assertRequestSize(request, 4 * 1_024);

    const rateLimit = consumeRequestRateLimit(
      request,
      LOGIN_RATE_LIMIT_SCOPE,
      5,
      15 * 60_000,
    );
    if (!rateLimit.allowed) {
      return redirectToLogin(
        request,
        "rate-limit",
        rateLimitHeaders(rateLimit),
      );
    }

    const form = await request.formData();
    const password = String(form.get("password") ?? "");

    if (
      !passwordIsConfigured()
      || password.length > 256
      || !passwordIsValid(password)
    ) {
      return redirectToLogin(request, "password");
    }

    const sessionToken = createAdminSessionToken();
    if (!sessionToken) return redirectToLogin(request, "configuration");

    clearRequestRateLimit(request, LOGIN_RATE_LIMIT_SCOPE);
    const response = NextResponse.redirect(new URL("/admin", request.url), 303);
    response.headers.set("Cache-Control", "private, no-store, max-age=0");
    response.cookies.set({
      name: ADMIN_COOKIE,
      value: sessionToken,
      httpOnly: true,
      sameSite: "strict",
      secure:
        process.env.NODE_ENV === "production"
        || new URL(request.url).protocol === "https:",
      path: "/",
      maxAge: ADMIN_SESSION_TTL_SECONDS,
      priority: "high",
    });
    return response;
  } catch (error) {
    return securityErrorResponse(error);
  }
}
