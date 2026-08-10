import { NextResponse } from "next/server";
import { ADMIN_COOKIE } from "../../../../lib/admin-auth";
import {
  assertSameOriginMutation,
  securityErrorResponse,
} from "../../../../lib/http-security";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    assertSameOriginMutation(request);
    const response = NextResponse.redirect(new URL("/", request.url), 303);
    response.headers.set("Cache-Control", "private, no-store, max-age=0");
    const secure =
      process.env.NODE_ENV === "production"
      || new URL(request.url).protocol === "https:";

    for (const name of new Set([ADMIN_COOKIE, "raduyka_admin"])) {
      response.cookies.set({
        name,
        value: "",
        httpOnly: true,
        sameSite: "strict",
        secure,
        path: "/",
        maxAge: 0,
      });
    }

    return response;
  } catch (error) {
    return securityErrorResponse(error);
  }
}
