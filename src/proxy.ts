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

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
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
  matcher: ["/app/:path*", "/onboarding", "/onboarding/:path*", "/q/:path*"],
};
