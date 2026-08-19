import type { NextRequest } from "next/server";
import { updateSupabaseSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return updateSupabaseSession(request);
}

export const config = {
  matcher: [
    "/account/:path*",
    "/update-password/:path*",
    "/api/bonus/:path*",
    "/api/reminders/:path*",
    "/api/push/:path*",
  ],
};
