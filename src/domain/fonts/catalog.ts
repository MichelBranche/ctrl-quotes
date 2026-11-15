import rows from "./catalog.json";
import { toEntry, type CatalogRow, type FontEntry, type FontRef } from "./index";

/** Full catalog, sorted by popularity. Server side and the lazily loaded font picker read it. */
export const fontCatalog: FontEntry[] = (rows as CatalogRow[]).map(toEntry);

const byRef = new Map(fontCatalog.map((entry) => [entry.ref, entry]));

export function findFont(ref: string): FontEntry | null {
  return byRef.get(ref as FontRef) ?? null;
}
