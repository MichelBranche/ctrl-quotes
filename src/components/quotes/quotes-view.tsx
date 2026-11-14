"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Copy, FileText, Plus, SquarePen, Trash2 } from "lucide-react";
import { motion } from "motion/react";
import { FilterTabs, Pagination, SearchBox } from "@/components/data/controls";
import { FROM_BOTTOM, FROM_LEFT, useCardMotion } from "@/components/motion/card-motion";
import { useMoving, useSectionTransition } from "@/components/motion/section-transition";
import { cn } from "@/lib/cn";
import { ActionMenu } from "@/components/data/menu";
import { useAction } from "@/components/data/use-action";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/overlays";
import { IllustratedEmpty } from "@/components/ui/illustrated-empty";
import { PageHeader, StatusBadge } from "@/components/ui/status";
import { messages } from "@/i18n/it";
import { formatEuro } from "@/domain/money";
import { quoteStatusLabel, quoteStatusTone, type QuoteFilter } from "@/domain/quote-status";
import { deleteQuoteAction, duplicateQuoteAction } from "@/server/actions/quotes";
import type { QuoteList, QuoteRow } from "@/server/quotes";

const dateFormat = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Rome" });

export function QuoteAmount({ row }: { row: Pick<QuoteRow, "totalCents" | "recurringCents"> }) {
  return (
    <>
      {formatEuro(row.totalCents)}
      {row.recurringCents > 0 ? <span className="muted small block">+ {formatEuro(row.recurringCents)} ricorrenti</span> : null}
    </>
  );
}

export function QuotesView({ list, filter, canWrite }: { list: QuoteList; filter: QuoteFilter; canWrite: boolean }) {
  const router = useRouter();
  const { run, pending } = useAction();
  const [confirming, setConfirming] = useState<QuoteRow | null>(null);
  const hasAny = list.workspaceTotal > 0;
  // Build up / tear down: title fades, toolbar from the left, list from below; out in reverse.
  const m = useCardMotion();
  const { visit, leaving } = useSectionTransition();
  const { moving, settle } = useMoving();
  return (
    <motion.div
      key={visit}
      className={cn("stack qv-page", leaving && "is-leaving", moving && "is-moving")}
      variants={m.grid}
      initial="hidden"
      animate={leaving ? "exit" : "show"}
      onAnimationComplete={settle}
    >
      <motion.div {...m.head(leaving)}>
      <PageHeader
        title="Preventivi"
        subtitle="Crea, gestisci e monitora tutte le tue proposte."
        action={
          canWrite ? (
            <Link className={`btn btn-primary${hasAny ? "" : " hide-on-narrow"}`} href="/app/quotes/new">
              <Plus size={16} aria-hidden="true" /> Nuovo preventivo
            </Link>
          ) : undefined
        }
      />
      </motion.div>
      <motion.div className="card toolbar" variants={m.item} custom={FROM_LEFT}>
        <FilterTabs
          label="Filtra per stato"
          param="status"
          current={filter}
          options={[
            { value: "all", label: "Tutti", count: list.counts.all },
            { value: "draft", label: "Bozze", count: list.counts.draft },
            { value: "pending", label: "Inviati", count: list.counts.pending },
            { value: "accepted", label: "Accettati", count: list.counts.accepted },
            { value: "rejected", label: "Rifiutati", count: list.counts.rejected },
            { value: "expired", label: "Scaduti", count: list.counts.expired },
          ]}
        />
        <div className="toolbar-end">
          <SearchBox label="Cerca preventivi" placeholder="Cerca per titolo, numero o cliente" />
        </div>
      </motion.div>
      <motion.section className="card list-pane quotes-list" aria-label="Elenco preventivi" variants={m.item} custom={FROM_BOTTOM}>
        {list.items.length === 0 ? (
          hasAny ? (
            <div className="list-empty">
              <FileText size={22} aria-hidden="true" />
              <p>Nessun preventivo corrisponde a ricerca e filtri.</p>
              <Link className="btn btn-secondary" href="/app/quotes" replace>
                Azzera filtri
              </Link>
            </div>
          ) : (
            <IllustratedEmpty
              scene="first-quote"
              title={messages.quotes.firstTitle}
              body={messages.quotes.firstBody}
              float
              action={
                canWrite ? (
                  <Link className="btn btn-primary" href="/app/quotes/new">
                    <Plus size={16} aria-hidden="true" /> {messages.quotes.action}
                  </Link>
                ) : undefined
              }
            />
          )
        ) : (
          <div className="quote-table">
            <div className="quote-head" aria-hidden="true">
              <span>Preventivo</span>
              <span>Cliente</span>
              <span>Stato</span>
              <span>Aggiornato</span>
              <span className="num">Totale</span>
              <span />
            </div>
            <ul className="quote-rows" aria-label="Preventivi">
              {list.items.map((row) => (
                <li key={row.id} className="quote-row">
                  <Link href={`/app/quotes/${row.id}`} className="quote-main">
                    <span className="quote-icon" aria-hidden="true">
                      <FileText size={16} />
                    </span>
                    <span>
                      <strong className="clamp-1">{row.title}</strong>
                      <span className="muted small block">
                        {row.number ?? "Senza numero"}
                        {row.versionCount > 0 ? ` · ${row.versionCount} ${row.versionCount === 1 ? "versione" : "versioni"}` : ""}
                      </span>
                    </span>
                  </Link>
                  <span className="quote-client clamp-1">{row.clientName ?? <span className="muted">Nessun cliente</span>}</span>
                  <span>
                    <StatusBadge tone={quoteStatusTone[row.status]}>{quoteStatusLabel[row.status]}</StatusBadge>
                  </span>
                  <span className="muted small">{dateFormat.format(row.updatedAt)}</span>
                  <span className="num quote-total">
                    <QuoteAmount row={row} />
                  </span>
                  <span className="row-actions">
                    <ActionMenu
                      label={`Azioni per ${row.title}`}
                      items={[
                        { label: "Apri nell'editor", icon: <SquarePen size={16} aria-hidden="true" />, onSelect: () => router.push(`/app/quotes/${row.id}`) },
                        {
                          label: "Duplica",
                          icon: <Copy size={16} aria-hidden="true" />,
                          onSelect: () => run(() => duplicateQuoteAction(row.id), (value) => router.push(`/app/quotes/${value.id}`)),
                          disabledReason: canWrite ? undefined : "Il tuo ruolo permette solo la consultazione.",
                        },
                        {
                          label: "Elimina",
                          icon: <Trash2 size={16} aria-hidden="true" />,
                          danger: true,
                          onSelect: () => setConfirming(row),
                        },
                      ]}
                    />
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <Pagination page={list.page} pageSize={list.pageSize} total={list.total} noun="preventivi" />
      </motion.section>
      <Dialog open={confirming !== null} title="Eliminare il preventivo?" onClose={() => setConfirming(null)}>
        <p>
          {confirming?.number ?? "Il preventivo"} sparirà dall&apos;elenco e dallo storico del cliente. Il numero non verrà riutilizzato.
        </p>
        <div className="dialog-actions">
          <Button variant="secondary" onClick={() => setConfirming(null)} autoFocus>
            Annulla
          </Button>
          <Button
            className="btn-danger"
            loading={pending}
            onClick={() => {
              const target = confirming;
              if (target) run(() => deleteQuoteAction(target.id), () => setConfirming(null));
            }}
          >
            Elimina
          </Button>
        </div>
      </Dialog>
    </motion.div>
  );
}
