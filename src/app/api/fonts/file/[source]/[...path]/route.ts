import { upstreamFileUrl } from "@/domain/fonts";

/** Streams one font file from Google Fonts or Fontshare. Fixed hosts, font extensions only. */
const types: Record<string, string> = { woff2: "font/woff2", woff: "font/woff", ttf: "font/ttf" };
const maxBytes = 6 * 1024 * 1024;

export async function GET(_request: Request, context: { params: Promise<{ source: string; path: string[] }> }): Promise<Response> {
  const { source, path } = await context.params;
  const upstream = upstreamFileUrl(source, path.join("/"));
  if (!upstream) return new Response("Non trovato", { status: 404 });
  try {
    const response = await fetch(upstream, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) return new Response("Non trovato", { status: 404 });
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength > maxBytes) return new Response("Troppo grande", { status: 413 });
    const extension = upstream.split(".").pop() ?? "";
    return new Response(bytes, {
      headers: {
        "Content-Type": types[extension] ?? "application/octet-stream",
        "Cache-Control": "public, max-age=31536000, immutable",
        "Access-Control-Allow-Origin": "*",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("Non disponibile", { status: 502 });
  }
}
