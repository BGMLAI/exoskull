import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  // Inject request ID for correlation across logs
  const requestId = crypto.randomUUID().slice(0, 8);
  request.headers.set("x-request-id", requestId);

  const response = await updateSession(request);

  // Attach request ID to response for client-side debugging
  response.headers.set("x-request-id", requestId);

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
