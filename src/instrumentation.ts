export async function register(): Promise<void> {
  // Migrations must not start here. With Cache Components this hook runs while
  // static pages are prerendered, and the Turso fetch outlives that prerender.
  // Apply them with `npm run db:migrate`, or at request time via ensureMigrated()
  // after connection().
}
