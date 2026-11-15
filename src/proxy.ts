import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";
import { legacyQuoteRedirect, PUBLIC_QUOTE_PREFIX } from "@/domain/public-url";

/** URL as typed by the visitor: the Host header decides, so a retired domain is recognised. */
function requestedUrl(request: NextRequest): URL {
  const host = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() || request.headers.get("host");
  const url = new URL(request.url);
  if (!host) return url;
  // Rebuilt from scratch: assigning url.host would keep the old port when the header has none.
  return new URL(`${url.protocol}//${host}${url.pathname}${url.search}`);
}

/** Opt-out for signed-in visitors who want the marketing page: /?home=1 (linked from the app menu). */
export const LANDING_BYPASS_PARAM = "home";

function isSessionCookie(name: string): boolean {
  return /(^|\.)session_(token|data)$/.test(name.replace(/^__Secure-|^__Host-/, ""));
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname === "/") {
    // Cookie presence only (no DB hit): /app does the real check. A stale cookie ends on /session-expired,
    // which clears it below, so the landing is reachable again on the next visit and nothing loops.
    if (request.nextUrl.searchParams.has(LANDING_BYPASS_PARAM) || !getSessionCookie(request)) return NextResponse.next();
    const url = request.nextUrl.clone();
    url.pathname = "/app/overview";
    url.search = "";
    return NextResponse.redirect(url);
  }
  if (pathname === "/session-expired") {
    const response = NextResponse.next();
    for (const cookie of request.cookies.getAll()) {
      if (!isSessionCookie(cookie.name)) continue;
      const secure = cookie.name.startsWith("__Secure-") || cookie.name.startsWith("__Host-") || request.nextUrl.protocol === "https:";
      response.cookies.set(cookie.name, "", { path: "/", maxAge: 0, secure, httpOnly: true, sameSite: "lax" });
    }
    return response;
  }
  if (pathname.startsWith(PUBLIC_QUOTE_PREFIX)) {
    // Client links: no login. Links on a retired host move to the current one, token included.
    const target = legacyQuoteRedirect(requestedUrl(request), process.env);
    return target ? NextResponse.redirect(target, 308) : NextResponse.next();
  }
  if (!getSessionCookie(request)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/session-expired", "/app/:path*", "/onboarding", "/onboarding/:path*", "/q/:path*"],
};
