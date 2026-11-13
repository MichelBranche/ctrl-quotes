import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";
import { legacyQuoteRedirect, PUBLIC_QUOTE_PREFIX } from "@/domain/public-url";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname.startsWith(PUBLIC_QUOTE_PREFIX)) {
    // Client links: no login. Links on a retired host move to the current one, token included.
    const target = legacyQuoteRedirect(new URL(request.url), process.env);
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
  matcher: ["/app/:path*", "/onboarding", "/q/:path*"],
};
