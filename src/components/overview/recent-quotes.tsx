"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, FileText } from "lucide-react";
import { StatusBadge } from "@/components/ui/status";
import { formatEuro } from "@/domain/money";
import { quoteStatusLabel, quoteStatusTone, type QuoteStatus } from "@/domain/quote-status";
import { cn } from "@/lib/cn";

type Row = { id: string; number: string | null; title: string; status: QuoteStatus; clientName: string | null; totalCents: number };

const chips = [
  { key: "all", label: "Recenti" },
  { key: "pending", label: "Inviati" },
  { key: "accepted", label: "Accettati" },
  { key: "draft", label: "Bozze" },
] as const;

type ChipKey = (typeof chips)[number]["key"];

export function RecentQuotes({ rows }: { rows: Row[] }) {
  const [chip, setChip] = useState<ChipKey>("all");
  const visible = rows.filter((row) => chip === "all" || row.status === chip).slice(0, 5);
  return (
    <>
      <div className="ov-section-head">
        <h2 id="ov-quotes-title">I tuoi preventivi</h2>
        <div className="ov-chips" role="group" aria-label="Filtra preventivi">
          {chips.map((item) => (
            <button key={item.key} type="button" className={cn("ov-chip", chip === item.key && "is-active")} aria-pressed={chip === item.key} onClick={() => setChip(item.key)}>
              {item.label}
            </button>
          ))}
        </div>
        <Link className="ov-link-all" href="/app/quotes">
          Vedi tutti <ArrowRight size={14} aria-hidden="true" />
        </Link>
      </div>
      {visible.length === 0 ? (
        <p className="ov-none">Nessun preventivo in questo filtro.</p>
      ) : (
        <ul className="ov-list">
          {visible.map((row) => (
            <li key={row.id}>
              <Link href={`/app/quotes/${row.id}`} className="ov-item">
                <span className="ov-item-ico" aria-hidden="true">
                  <FileText size={18} />
                </span>
                <span className="ov-item-main">
                  <strong>{row.title}</strong>
                  <span>{[row.number, row.clientName].filter(Boolean).join(" · ") || "Senza cliente"}</span>
                </span>
                <span className="ov-item-total">{formatEuro(row.totalCents)}</span>
                <StatusBadge tone={quoteStatusTone[row.status]}>{quoteStatusLabel[row.status]}</StatusBadge>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
