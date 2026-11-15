"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Search } from "lucide-react";
import { fontCategories, fontCategoryLabel, fontCssHref, fontFamilyName, type FontCategory, type FontEntry, type FontRef } from "@/domain/fonts";
import { cn } from "@/lib/cn";

/**
 * Font library picker: search, categories, the Brand Kit fonts pinned, recently used, and every
 * family previewed in its own face. Previews load lazily, only for rows on screen, through the
 * app's own font route (a light 400 sheet per family).
 */

const RECENT_KEY = "cq.fonts.recent";
const PAGE = 60;
const loaded = new Set<string>();

export function rememberFont(ref: FontRef) {
  try {
    const list = JSON.parse(window.localStorage.getItem(RECENT_KEY) ?? "[]") as string[];
    window.localStorage.setItem(RECENT_KEY, JSON.stringify([ref, ...list.filter((item) => item !== ref)].slice(0, 8)));
  } catch {
    // Private mode: recents are a convenience.
  }
}

function readRecent(): string[] {
  try {
    const list = JSON.parse(window.localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(list) ? list.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

/** Adds preview stylesheets for families not loaded yet, twelve per request. */
function loadPreviews(refs: FontRef[]) {
  const missing = refs.filter((ref) => !loaded.has(ref));
  for (let index = 0; index < missing.length; index += 12) {
    const batch = missing.slice(index, index + 12);
    const href = fontCssHref(batch, { preview: true });
    if (!href) continue;
    batch.forEach((ref) => loaded.add(ref));
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.dataset.cqPreview = "";
    document.head.appendChild(link);
  }
}

let catalogPromise: Promise<FontEntry[]> | null = null;
export function loadCatalog(): Promise<FontEntry[]> {
  catalogPromise ??= import("@/domain/fonts/catalog").then((module) => module.fontCatalog);
  return catalogPromise;
}

export function useCatalog(): FontEntry[] | null {
  const [catalog, setCatalog] = useState<FontEntry[] | null>(null);
  useEffect(() => {
    let alive = true;
    void loadCatalog().then((list) => {
      if (alive) setCatalog(list);
    });
    return () => {
      alive = false;
    };
  }, []);
  return catalog;
}

export function FontPicker({
  value,
  brand,
  onPick,
  autoFocus = true,
}: {
  value: FontRef | null;
  /** Brand Kit fonts, pinned on top. */
  brand: Array<{ ref: FontRef; role: string }>;
  /** Null: back to the template font. */
  onPick: (ref: FontRef | null) => void;
  autoFocus?: boolean;
}) {
  const catalog = useCatalog();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<FontCategory | "all">("all");
  const [limit, setLimit] = useState(PAGE);
  const [recent] = useState(readRecent);
  const listRef = useRef<HTMLDivElement>(null);
  const byRef = useMemo(() => new Map((catalog ?? []).map((entry) => [entry.ref as string, entry])), [catalog]);

  const filtered = useMemo(() => {
    if (!catalog) return [];
    const needle = query.trim().toLowerCase();
    return catalog.filter((entry) => (category === "all" || entry.category === category) && (!needle || entry.name.toLowerCase().includes(needle)));
  }, [catalog, query, category]);
  const shown = filtered.slice(0, limit);
  const pinned = !query && category === "all";
  const brandRows = pinned ? brand.map((item) => ({ entry: byRef.get(item.ref), role: item.role })).filter((item): item is { entry: FontEntry; role: string } => Boolean(item.entry)) : [];
  const recentRows = pinned ? recent.map((ref) => byRef.get(ref)).filter((entry): entry is FontEntry => Boolean(entry)) : [];

  // Previews of the rows on screen.
  useEffect(() => {
    const root = listRef.current;
    if (!root || typeof IntersectionObserver === "undefined") return;
    let queue: FontRef[] = [];
    let timer = 0;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const ref = (entry.target as HTMLElement).dataset.font as FontRef | undefined;
          if (ref) queue.push(ref);
          observer.unobserve(entry.target);
        }
        window.clearTimeout(timer);
        timer = window.setTimeout(() => {
          loadPreviews(queue);
          queue = [];
        }, 90);
      },
      { root, rootMargin: "120px 0px" },
    );
    for (const row of root.querySelectorAll("[data-font]")) observer.observe(row);
    return () => {
      observer.disconnect();
      window.clearTimeout(timer);
    };
  }, [shown.length, query, category, catalog, brandRows.length, recentRows.length]);

  const row = (entry: FontEntry, note?: string) => (
    <button
      key={`${note ?? ""}${entry.ref}`}
      type="button"
      role="option"
      aria-selected={value === entry.ref}
      className={cn("fp-row", value === entry.ref && "is-on")}
      data-font={entry.ref}
      onClick={() => {
        rememberFont(entry.ref);
        onPick(entry.ref);
      }}
    >
      <span className="fp-name" style={{ fontFamily: `"${fontFamilyName(entry.ref)}", system-ui, sans-serif` }}>
        {entry.name}
      </span>
      <span className="fp-meta">{note ?? (entry.source === "fs" ? "Fontshare" : fontCategoryLabel[entry.category])}</span>
      {value === entry.ref ? <Check size={14} aria-hidden="true" className="fp-check" /> : null}
    </button>
  );

  return (
    <div className="fp" data-ve-text-ui="">
      <label className="fp-search">
        <Search size={14} aria-hidden="true" />
        <input
          type="search"
          value={query}
          autoFocus={autoFocus}
          placeholder={catalog ? `Cerca tra ${catalog.length} font gratuiti` : "Carico i font…"}
          aria-label="Cerca un font"
          onChange={(event) => {
            setQuery(event.target.value);
            setLimit(PAGE);
          }}
        />
      </label>
      <div className="fp-cats" role="group" aria-label="Categorie">
        {(["all", ...fontCategories] as const).map((key) => (
          <button
            key={key}
            type="button"
            className={cn("fp-cat", category === key && "is-on")}
            aria-pressed={category === key}
            onClick={() => {
              setCategory(key);
              setLimit(PAGE);
            }}
          >
            {key === "all" ? "Tutti" : fontCategoryLabel[key]}
          </button>
        ))}
      </div>
      <div
        ref={listRef}
        className="fp-list"
        role="listbox"
        aria-label="Font"
        onScroll={(event) => {
          const node = event.currentTarget;
          if (node.scrollTop + node.clientHeight > node.scrollHeight - 200 && limit < filtered.length) setLimit((current) => current + PAGE);
        }}
      >
        {pinned ? (
          <button type="button" role="option" aria-selected={value === null} className={cn("fp-row", value === null && "is-on")} onClick={() => onPick(null)}>
            <span className="fp-name">Font del template</span>
            <span className="fp-meta">Predefinito</span>
            {value === null ? <Check size={14} aria-hidden="true" className="fp-check" /> : null}
          </button>
        ) : null}
        {brandRows.length ? <p className="fp-group">Font del brand</p> : null}
        {brandRows.map((item) => row(item.entry, item.role))}
        {recentRows.length ? <p className="fp-group">Usati di recente</p> : null}
        {recentRows.map((entry) => row(entry, "Recente"))}
        {pinned && (brandRows.length || recentRows.length) ? <p className="fp-group">Tutti i font</p> : null}
        {shown.map((entry) => row(entry))}
        {catalog && !filtered.length ? <p className="fp-empty">Nessun font con questo nome.</p> : null}
      </div>
      <p className="fp-foot">Google Fonts e Fontshare, licenze libere anche per PDF e uso commerciale.</p>
    </div>
  );
}
