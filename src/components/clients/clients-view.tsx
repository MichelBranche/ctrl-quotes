"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Download, Plus, UserRound, Users } from "lucide-react";
import { ClientDetailPanel } from "@/components/clients/client-detail";
import { ClientFormDialog } from "@/components/clients/client-form";
import { ImportDialog } from "@/components/clients/import-dialog";
import { FilterTabs, Pagination, SearchBox, useHref } from "@/components/data/controls";
import { Button } from "@/components/ui/button";
import { ClientAvatar } from "@/components/ui/data-display";
import { EmptyState, PageHeader } from "@/components/ui/status";
import { clientKindLabel, type ClientFilter, type ClientKind } from "@/domain/clients";
import { permissionDeniedMessage } from "@/domain/permissions";
import { cn } from "@/lib/cn";
import type { ClientDetail, ClientList } from "@/server/clients";

export type ClientPermissions = { write: boolean; remove: boolean; importCsv: boolean };

export function ClientsView({
  list,
  filter,
  kind,
  q,
  selectedId,
  detail,
  detailMissing,
  permissions,
}: {
  list: ClientList;
  filter: ClientFilter;
  kind: ClientKind | "all";
  q: string;
  selectedId: string | null;
  detail: ClientDetail | null;
  detailMissing: boolean;
  permissions: ClientPermissions;
}) {
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const href = useHref();
  const hasAny = list.workspaceTotal > 0;

  return (
    <div className={cn("two-pane-page", selectedId && "has-selection")}>
      <PageHeader
        title="Clienti"
        subtitle="Gestisci la rubrica, i referenti e le note interne."
        action={
          <div className="header-actions">
            <Button
              variant="secondary"
              onClick={() => setImporting(true)}
              disabled={!permissions.importCsv}
              title={permissions.importCsv ? undefined : permissionDeniedMessage.member}
            >
              <Download size={16} aria-hidden="true" /> Importa contatti
            </Button>
            <Button onClick={() => setCreating(true)} disabled={!permissions.write}>
              <Plus size={16} aria-hidden="true" /> Nuovo cliente
            </Button>
          </div>
        }
      />
      {!permissions.importCsv ? (
        <p className="field-hint header-note">L&apos;importazione CSV è riservata ad amministratori e proprietario.</p>
      ) : null}

      <div className="two-pane">
        <section className="card list-pane" aria-label="Rubrica">
          <FilterTabs
            label="Filtra per stato"
            param="filter"
            current={filter}
            options={[
              { value: "all", label: "Tutti", count: list.counts.all },
              { value: "active", label: "Attivi", count: list.counts.active },
              { value: "prospect", label: "Prospect", count: list.counts.prospect },
              { value: "archived", label: "Archiviati", count: list.counts.archived },
            ]}
          />
          <div className="list-tools">
            <SearchBox label="Cerca cliente" placeholder="Cerca per nome, email, P. IVA" />
            <nav className="kind-filter" aria-label="Filtra per tipo">
              {(["all", "azienda", "privato"] as const).map((value) => (
                <Link
                  key={value}
                  href={href({ kind: value === "all" ? null : value, page: null })}
                  aria-current={kind === value ? "page" : undefined}
                  scroll={false}
                  replace
                >
                  {value === "all" ? "Tutti i tipi" : clientKindLabel[value]}
                </Link>
              ))}
            </nav>
          </div>

          {list.items.length === 0 ? (
            <div className="list-empty">
              <Users size={22} aria-hidden="true" />
              <p>
                {hasAny
                  ? "Nessun cliente corrisponde a ricerca e filtri."
                  : "La rubrica è vuota. Aggiungi il primo cliente o importa un CSV."}
              </p>
              {hasAny && (q || kind !== "all" || filter !== "all") ? (
                <Link className="btn btn-secondary" href="/app/clients" replace>
                  Azzera filtri
                </Link>
              ) : null}
            </div>
          ) : (
            <ul className="entity-list">
              {list.items.map((client) => (
                <li key={client.id}>
                  <Link
                    href={href({ id: client.id })}
                    className="entity-row"
                    aria-current={client.id === selectedId ? "true" : undefined}
                    scroll={false}
                  >
                    <ClientAvatar name={client.name} />
                    <span className="entity-main">
                      <strong>{client.name}</strong>
                      <span className="entity-meta">
                        <i className={cn("dot", `dot-${client.status}`)} aria-hidden="true" />
                        {client.sector ?? clientKindLabel[client.kind]}
                        <span className="visually-hidden">
                          , {client.status === "active" ? "attivo" : client.status === "prospect" ? "prospect" : "archiviato"}
                        </span>
                      </span>
                    </span>
                    {client.kind === "privato" ? <UserRound size={14} className="muted" aria-label="Privato" /> : null}
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <Pagination page={list.page} pageSize={list.pageSize} total={list.total} noun="clienti" />
        </section>

        <section className="detail-pane" aria-label="Dettaglio cliente">
          {selectedId ? (
            <Link href={href({ id: null })} className="btn btn-ghost back-link" scroll={false}>
              <ArrowLeft size={16} aria-hidden="true" /> Torna alla rubrica
            </Link>
          ) : null}
          {detail ? (
            <ClientDetailPanel key={detail.id} client={detail} permissions={permissions} />
          ) : detailMissing ? (
            <EmptyState title="Cliente non disponibile" body="Il cliente non esiste o è stato eliminato. Scegline un altro dalla rubrica." />
          ) : (
            <EmptyState
              title={hasAny ? "Seleziona un cliente" : "Nessun cliente"}
              body={
                hasAny
                  ? "Apri un cliente dalla rubrica per vedere dati, referenti e note."
                  : "I clienti che crei restano in questo workspace e saranno disponibili come destinatari dei preventivi."
              }
              action={
                permissions.write && !hasAny ? (
                  <Button onClick={() => setCreating(true)}>
                    <Plus size={16} aria-hidden="true" /> Nuovo cliente
                  </Button>
                ) : undefined
              }
            />
          )}
        </section>
      </div>

      <ClientFormDialog open={creating} onClose={() => setCreating(false)} client={null} />
      {permissions.importCsv ? <ImportDialog open={importing} onClose={() => setImporting(false)} /> : null}
    </div>
  );
}
