"use client";

import { useEffect, useState } from "react";
import { useReducedMotion } from "motion/react";
import { formatEuro } from "@/domain/money";
import { motionDurations } from "@/lib/motion";

export function ClientAvatar({ name }: { name: string }) {
  const initials = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <span className="avatar" aria-hidden="true">
      {initials || "?"}
    </span>
  );
}

export function MetricCard({ label, cents }: { label: string; cents: number }) {
  return (
    <article className="card metric">
      <span className="muted">{label}</span>
      <strong>
        <CountUp cents={cents} />
      </strong>
    </article>
  );
}

function CountUp({ cents }: { cents: number }) {
  const reduced = useReducedMotion();
  const [value, setValue] = useState(reduced ? cents : 0);
  useEffect(() => {
    if (reduced) return;
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / motionDurations.metric);
      const eased = 1 - (1 - progress) ** 3;
      setValue(Math.round(cents * eased));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [cents, reduced]);
  return <span>{formatEuro(reduced ? cents : value)}</span>;
}

export function DataTable({
  caption,
  columns,
  rows,
}: {
  caption: string;
  columns: string[];
  rows: string[][];
}) {
  return (
    <div className="table-wrap">
      <table className="data">
        <caption className="visually-hidden">{caption}</caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column} scope="col">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row[0] ?? index}>
              {row.map((cell, cellIndex) => (
                <td key={`${cell}-${cellIndex}`}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Timeline({ items }: { items: Array<{ id: string; title: string; meta: string }> }) {
  return (
    <ol className="timeline">
      {items.map((item) => (
        <li key={item.id}>
          <strong>{item.title}</strong>
          <div className="muted">{item.meta}</div>
        </li>
      ))}
    </ol>
  );
}

export function TemplateCard({ name, active = false }: { name: string; active?: boolean }) {
  return (
    <article className="card is-interactive" style={{ padding: 16 }}>
      <div className="quote-preview">
        <small>CTRL®</small>
        <h3>{name}</h3>
      </div>
      <p style={{ marginBottom: 0 }}>{active ? "Template attivo" : "Usa template"}</p>
    </article>
  );
}

export function QuotePreview({ title, client }: { title: string; client: string }) {
  return (
    <article className="quote-preview" aria-label="Anteprima preventivo">
      <small>PROPOSTA COMMERCIALE</small>
      <h3>{title}</h3>
      <p>Per {client}</p>
    </article>
  );
}

export function SectionBlock({ title, children }: { title: string; children: string }) {
  return (
    <section className="card" style={{ padding: 16 }}>
      <h3 style={{ marginTop: 0 }}>{title}</h3>
      <p>{children}</p>
    </section>
  );
}

export function FilterBar() {
  return (
    <div className="segmented" aria-label="Filtri di esempio">
      <button type="button" aria-pressed="true">
        Tutti
      </button>
      <button type="button" aria-pressed="false" aria-disabled="true">
        Bozza
      </button>
    </div>
  );
}
