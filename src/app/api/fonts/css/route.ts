import { findFont } from "@/domain/fonts/catalog";
import { parseFaces, rewriteCss, upstreamCssUrl, type FontRef } from "@/domain/fonts";

/**
 * Same-origin stylesheet for library fonts (Google Fonts, Fontshare). Only catalog families,
 * at most 12 per request; file URLs point to /api/fonts/file, so the CSP stays 'self' and no
 * third party sees who opens a quote.
 */
const browserAgent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const memo = new Map<string, { css: string; at: number }>();

async function sheet(ref: FontRef, preview: boolean): Promise<string> {
  const entry = findFont(ref);
  if (!entry) return "";
  const key = `${ref}|${preview ? 1 : 0}`;
  const hit = memo.get(key);
  if (hit && Date.now() - hit.at < 86_400_000) return hit.css;
  try {
    const response = await fetch(upstreamCssUrl(entry, { preview }), { headers: { "user-agent": browserAgent }, signal: AbortSignal.timeout(6000) });
    if (!response.ok) return "";
    const css = rewriteCss(ref, parseFaces(await response.text()));
    if (memo.size > 2000) memo.clear();
    memo.set(key, { css, at: Date.now() });
    return css;
  } catch {
    return "";
  }
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const refs = [...new Set(url.searchParams.getAll("f"))].filter((ref): ref is FontRef => findFont(ref) !== null).slice(0, 12);
  const preview = url.searchParams.get("p") === "1";
  const parts = await Promise.all(refs.map((ref) => sheet(ref, preview)));
  const css = parts.filter(Boolean).join("\n");
  return new Response(css, {
    headers: {
      "Content-Type": "text/css; charset=utf-8",
      "Cache-Control": css ? "public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400" : "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
