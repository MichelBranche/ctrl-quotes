export async function register(): Promise<void> {
  // Migrations must not start here. With Cache Components this hook runs while
  // static pages are prerendered, and the Turso fetch outlives that prerender.
  // Apply them with `npm run db:migrate`, or at request time via ensureMigrated()
  // after connection().
}

type RequestInfo = { path?: string; method?: string };

/** Next.js hook: server render/route/action failures. Never inspects headers or cookies. */
export async function onRequestError(error: Error & { digest?: string }, request: RequestInfo): Promise<void> {
  const { reportServerError } = await import("@/server/error-alert");
  await reportServerError({
    message: error.message || error.name || "Errore senza messaggio",
    digest: error.digest,
    route: request.path,
    method: request.method,
    source: "request",
  });
}
