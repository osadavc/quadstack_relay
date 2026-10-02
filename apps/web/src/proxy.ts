import { type NextRequest, NextResponse } from "next/server";

/*
 * Optimistic check only: no session cookie, no app. Pages still verify the
 * session and role on the server.
 */
export function proxy(request: NextRequest) {
  if (!request.cookies.has("relay_session")) {
    const url = new URL("/login", request.url);
    url.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dispatcher/:path*",
    "/driver/:path*",
    "/loader/:path*",
    "/store/:path*",
    "/h/:path*",
  ],
};
