import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// UX-only guard: redirect to /login when the session cookie is absent.
// The API enforces all authorization server-side.
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = Boolean(request.cookies.get("access_token"));
  if (!hasSession && pathname !== "/login") {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  // Do NOT redirect /login -> /requests based on cookie presence: a present but
  // invalid/expired cookie would loop with the client-side 401 handling.
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
