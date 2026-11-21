"use client";

import { useDeferredValue, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Search, X } from "lucide-react";
import type { HelpSearchItem } from "@/domain/help";

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/** Purple banner with the search over guides, FAQ and resources. Results open in a card under it. */
export function HelpHero({ items }: { items: HelpSearchItem[] }) {
  const [query, setQuery] = useState("");
  const deferred = useDeferredValue(query);
  const index = useMemo(() => items.map((item) => ({ item, hay: normalize(`${item.title} ${item.text}`) })), [items]);
  const terms = normalize(deferred).split(/\s+/).filter((term) => term.length > 1);
  const results = terms.length
    ? index
        .filter(({ hay }) => terms.every((term) => hay.includes(term)))
        .map(({ item }) => item)
        .slice(0, 8)
    : [];
  const open = terms.length > 0;

  return (
    <div className="hp-hero-wrap">
      <section className="hp-hero brand-fill" aria-labelledby="hp-hero-title">
        <div className="hp-hero-copy">
          <h2 id="hp-hero-title">Come possiamo aiutarti?</h2>
          <p>Cerca tra guide, FAQ e risorse per trovare subito la risposta.</p>
          <form className="hp-search" role="search" onSubmit={(event) => event.preventDefault()}>
            <Search size={18} aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Cerca guide, FAQ, risorse…"
              aria-label="Cerca nell'aiuto"
              aria-controls="hp-results"
              autoComplete="off"
            />
            {query ? (
              <button type="button" className="hp-search-clear" onClick={() => setQuery("")} aria-label="Cancella la ricerca">
                <X size={16} aria-hidden="true" />
              </button>
            ) : null}
          </form>
        </div>
        <span className="hp-hero-orb" aria-hidden="true" />
        <picture className="hp-hero-art">
          <source type="image/avif" srcSet="/help/stack-360.avif 360w, /help/stack-640.avif 640w" sizes="(max-width: 720px) 110px, 220px" />
          <source type="image/webp" srcSet="/help/stack-360.webp 360w, /help/stack-640.webp 640w" sizes="(max-width: 720px) 110px, 220px" />
          <img src="/help/stack-360.webp" alt="" width={360} height={413} />
        </picture>
      </section>

      <div id="hp-results" className="hp-results card" hidden={!open} aria-live="polite">
        {results.length ? (
          <ul>
            {results.map((item) => (
              <li key={`${item.kind}-${item.href}-${item.title}`}>
                <Link href={item.href} className="hp-result">
                  <span className="hp-result-kind">{item.kind}</span>
                  <span className="hp-result-body">
                    <strong>{item.title}</strong>
                    <span>{item.text}</span>
                  </span>
                  <ArrowUpRight size={16} aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="hp-results-empty">Nessun risultato. Prova con un&apos;altra parola o scrivici.</p>
        )}
      </div>
    </div>
  );
}
