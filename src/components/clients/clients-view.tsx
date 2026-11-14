"use client";

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { FROM_BOTTOM, FROM_LEFT, FROM_RIGHT, FROM_TOP, useCardMotion } from "@/components/motion/card-motion";
import { useMoving, useSectionTransition } from "@/components/motion/section-transition";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Archive,
  ArchiveRestore,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Download,
  LayoutGrid,
  List,
  ListFilter,
  Pencil,
  Plus,
  RotateCcw,
  UserCheck,
  UserPlus,
  Users,
} from "lucide-react";
import { ClientDetailPanel } from "@/components/clients/client-detail";
import type { QuoteRow } from "@/server/quotes";
import { ClientFormDialog } from "@/components/clients/client-form";
import { ImportDialog } from "@/components/clients/import-dialog";
import { FilterTabs, Pagination, SearchBox, useHref } from "@/components/data/controls";
import { ActionMenu } from "@/components/data/menu";
import { useAction } from "@/components/data/use-action";
import { Button } from "@/components/ui/button";
import { ClientAvatar } from "@/components/ui/data-display";
import { IllustratedEmpty } from "@/components/ui/illustrated-empty";
import { EmptyState, PageHeader, StatusBadge } from "@/components/ui/status";
import { messages } from "@/i18n/it";
import { clientKindLabel, clientStatusLabel, type ClientFilter, type ClientKind, type ClientStatus } from "@/domain/clients";
import { permissionDeniedMessage } from "@/domain/permissions";
import { cn } from "@/lib/cn";
import { archiveClientAction, archiveClientsAction } from "@/server/actions/clients";
import type { ClientDetail, ClientEvent, ClientList, ClientListItem, ClientSort, ClientStats } from "@/server/clients";

export type ClientPermissions = { write: boolean; remove: boolean; importCsv: boolean; createQuote: boolean };

const updatedFormat = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Rome" });

export const statusTone: Record<ClientStatus, "success" | "info" | "draft"> = { active: "success", prospect: "info", archived: "draft" };
const statusShort: Record<ClientStatus, string> = { active: "Attivo", prospect: "Prospect", archived: "Archiviato" };

export function ClientsView({
  list,
  stats,
  sort,
  view,
  timeline,
  filter,
  kind,
  q,
  selectedId,
  detail,
  detailMissing,
  permissions,
  quoteHistory,
}: {
  list: ClientList;
  stats: ClientStats;
  sort: ClientSort;
  view: "list" | "grid";
  timeline: ClientEvent[];
  filter: ClientFilter;
  kind: ClientKind | "all";
  q: string;
  selectedId: string | null;
  detail: ClientDetail | null;
  detailMissing: boolean;
  permissions: ClientPermissions;
  quoteHistory: QuoteRow[];
}) {
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const reducedMotion = useReducedMotion() ?? false;
  const fade = {
    initial: { opacity: reducedMotion ? 1 : 0 },
    animate: { opacity: 1 },
    exit: { opacity: reducedMotion ? 1 : 0, position: "absolute" as const, top: 0, left: 0, right: 0 },
    transition: { duration: reducedMotion ? 0 : 0.25, ease: [0.16, 1, 0.3, 1] as const },
  };
  const hasAny = list.workspaceTotal > 0;
  // Build up / tear down: title fades, KPIs from left / above / right, address book from below, client card from the right; out in reverse.
  const m = useCardMotion();
  const { visit, leaving } = useSectionTransition();
  const { moving, settle } = useMoving();

  return (
    <motion.div
      key={visit}
      className={cn("two-pane-page clients-page", selectedId && "has-selection", leaving && "is-leaving", moving && "is-moving")}
      variants={m.grid}
      initial="hidden"
      animate={leaving ? "exit" : "show"}
      onAnimationComplete={settle}
    >
      <motion.div {...m.head(leaving)}>
      <PageHeader
        title="Clienti"
        subtitle="Gestisci la rubrica, i referenti e le note interne."
        action={
          <div className="header-actions">
            <Button
              variant="secondary"
              onClick={() => setImporting(true)}
              disabled={!permissions.importCsv}
              title={permissions.importCsv ? undefined : "L'importazione CSV è riservata ad amministratori e proprietario."}
            >
              <Download size={16} aria-hidden="true" /> Importa contatti
            </Button>
            <Button onClick={() => setCreating(true)} disabled={!permissions.write}>
              <Plus size={16} aria-hidden="true" /> Nuovo cliente
            </Button>
          </div>
        }
      />
      </motion.div>

      <ClientKpis stats={stats} />

      <div className="two-pane clients-pane">
        <AddressBook
          list={list}
          sort={sort}
          view={view}
          filter={filter}
          kind={kind}
          q={q}
          selectedId={selectedId}
          permissions={permissions}
          onImport={() => setImporting(true)}
          onCreate={() => setCreating(true)}
        />

        <motion.section className="detail-pane" aria-label="Dettaglio cliente" variants={m.item} custom={FROM_RIGHT}>
          {selectedId ? <BackLink /> : null}
          <div className="detail-stage">
            <AnimatePresence initial={false}>
              {detail ? (
                <motion.div key={detail.id} className="detail-stage-item" {...fade}>
                  <ClientDetailPanel client={detail} permissions={permissions} quotes={quoteHistory} timeline={timeline} />
                </motion.div>
              ) : detailMissing ? (
                <motion.div key="missing" className="detail-stage-item" {...fade}>
                  <EmptyState title="Cliente non disponibile" body="Il cliente non esiste o è stato eliminato. Scegline un altro dalla rubrica." />
                </motion.div>
              ) : (
                <motion.div key="empty" className="detail-stage-item" {...fade}>
                  <IllustratedEmpty
                    scene="select-client"
                    title={hasAny ? messages.clients.selectTitle : messages.clients.emptyTitle}
                    body={hasAny ? messages.clients.selectBody : messages.clients.emptyBody}
                    compact
                    action={
                      permissions.write && !hasAny ? (
                        <Button onClick={() => setCreating(true)}>
                          <Plus size={16} aria-hidden="true" /> {messages.clients.action}
                        </Button>
                      ) : undefined
                    }
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.section>
      </div>

      <ClientFormDialog open={creating} onClose={() => setCreating(false)} client={null} />
      {permissions.importCsv ? <ImportDialog open={importing} onClose={() => setImporting(false)} /> : null}
    </motion.div>
  );
}

function BackLink() {
  const href = useHref();
  return (
    <Link href={href({ id: null })} className="btn btn-ghost back-link" scroll={false}>
      <ArrowLeft size={16} aria-hidden="true" /> Torna alla rubrica
    </Link>
  );
}

/* KPIs */

function ClientKpis({ stats }: { stats: ClientStats }) {
  const delta = stats.createdThisMonth - stats.createdLastMonth;
  const m = useCardMotion();
  const share = (value: number) => (stats.total > 0 ? `${Math.round((value / stats.total) * 100)}% della rubrica` : "Nessun cliente in rubrica");
  return (
    <div className="ov-kpis cl-kpis">
      <motion.section className="card ov-kpi cl-kpi" variants={m.item} custom={FROM_LEFT} whileHover={m.lift}>
        <span className="ov-kpi-ico">
          <Users size={20} aria-hidden="true" />
        </span>
        <div>
          <h2>Clienti totali</h2>
          <p className="ov-kpi-value">{stats.total}</p>
          <p className="ov-kpi-note">
            <span className={cn("cl-delta", delta > 0 && "is-up", delta < 0 && "is-down")}>
              {delta > 0 ? `+${delta}` : String(delta)}
            </span>{" "}
            nuovi questo mese rispetto al mese scorso
          </p>
        </div>
        <Sparkline values={stats.growth} label="Clienti in rubrica per mese di creazione, ultimi 8 mesi" />
      </motion.section>
      <motion.section className="card ov-kpi cl-kpi" variants={m.item} custom={FROM_TOP} whileHover={m.lift}>
        <span className="ov-kpi-ico">
          <UserCheck size={20} aria-hidden="true" />
        </span>
        <div>
          <h2>Clienti attivi</h2>
          <p className="ov-kpi-value">{stats.active}</p>
          <p className="ov-kpi-note">{share(stats.active)}</p>
        </div>
        <ShareRing value={stats.active} total={stats.total} />
      </motion.section>
      <motion.section className="card ov-kpi cl-kpi" variants={m.item} custom={FROM_RIGHT} whileHover={m.lift}>
        <span className="ov-kpi-ico">
          <UserPlus size={20} aria-hidden="true" />
        </span>
        <div>
          <h2>Prospect</h2>
          <p className="ov-kpi-value">{stats.prospect}</p>
          <p className="ov-kpi-note">{share(stats.prospect)}</p>
        </div>
        <ShareRing value={stats.prospect} total={stats.total} />
      </motion.section>
    </div>
  );
}

/** Area sparkline from a real series. A flat or empty series draws a light baseline only. */
export function Sparkline({ values, label }: { values: number[]; label: string }) {
  const width = 120;
  const height = 40;
  const max = Math.max(...values, 0);
  const min = Math.min(...values, 0);
  const flat = values.length < 2 || max === min;
  const points = values.map((value, index) => {
    const x = values.length < 2 ? 0 : (index / (values.length - 1)) * width;
    const y = flat ? height - 2 : height - 3 - ((value - min) / (max - min)) * (height - 8);
    return [x, y] as const;
  });
  const line = points.map(([x, y], index) => `${index ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  return (
    <svg className={cn("cl-spark", flat && "is-flat")} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label} preserveAspectRatio="none">
      {flat ? (
        <line x1="0" x2={width} y1={height - 2} y2={height - 2} />
      ) : (
        <>
          <path className="cl-spark-area" d={`${line} L${width} ${height} L0 ${height} Z`} />
          <path className="cl-spark-line" d={line} />
        </>
      )}
    </svg>
  );
}

/** Share of the address book as a small ring: a current ratio, not a time series. */
function ShareRing({ value, total }: { value: number; total: number }) {
  const ratio = total > 0 ? value / total : 0;
  const r = 15;
  const c = 2 * Math.PI * r;
  return (
    <svg className="cl-ring" viewBox="0 0 40 40" aria-hidden="true">
      <circle cx="20" cy="20" r={r} className="cl-ring-track" />
      <circle cx="20" cy="20" r={r} className="cl-ring-value" strokeDasharray={`${(ratio * c).toFixed(2)} ${c.toFixed(2)}`} transform="rotate(-90 20 20)" />
    </svg>
  );
}

/* Address book */

function AddressBook({
  list,
  sort,
  view,
  filter,
  kind,
  q,
  selectedId,
  permissions,
  onImport,
  onCreate,
}: {
  list: ClientList;
  sort: ClientSort;
  view: "list" | "grid";
  filter: ClientFilter;
  kind: ClientKind | "all";
  q: string;
  selectedId: string | null;
  permissions: ClientPermissions;
  onImport: () => void;
  onCreate: () => void;
}) {
  const href = useHref();
  const router = useRouter();
  const m = useCardMotion();
  const [checked, setChecked] = useState<string[]>([]);
  const [editing, setEditing] = useState<ClientListItem | null>(null);
  const { pending, run } = useAction();
  const hasAny = list.workspaceTotal > 0;
  const filtered = Boolean(q) || kind !== "all" || filter !== "all";
  const visibleIds = list.items.map((item) => item.id);
  const selection = checked.filter((id) => visibleIds.includes(id));
  const allChecked = visibleIds.length > 0 && selection.length === visibleIds.length;
  const archiving = filter !== "archived";

  const toggle = (id: string) => setChecked((current) => (current.includes(id) ? current.filter((value) => value !== id) : [...current, id]));
  const rowMenu = (client: ClientListItem) => (
    <ActionMenu
      label={`Opzioni per ${client.name}`}
      items={[
        {
          label: "Modifica",
          icon: <Pencil size={16} aria-hidden="true" />,
          onSelect: () => setEditing(client),
          disabledReason: permissions.write ? undefined : permissionDeniedMessage.member,
        },
        {
          label: client.status === "archived" ? "Ripristina" : "Archivia",
          icon: client.status === "archived" ? <ArchiveRestore size={16} aria-hidden="true" /> : <Archive size={16} aria-hidden="true" />,
          onSelect: () => run(() => archiveClientAction(client.id, client.status !== "archived")),
          disabledReason: permissions.write ? undefined : permissionDeniedMessage.member,
        },
      ]}
    />
  );

  return (
    <motion.section className="card list-pane cl-book" aria-labelledby="cl-book-title" variants={m.item} custom={FROM_BOTTOM}>
      <header className="cl-book-head">
        <h2 id="cl-book-title">
          La tua rubrica <span className="count">{list.workspaceTotal}</span>
        </h2>
        <div className="cl-book-tools">
          <nav className="cl-view" aria-label="Vista della rubrica">
            <Link href={href({ view: null })} aria-current={view === "list" ? "page" : undefined} aria-label="Vista elenco" title="Elenco" scroll={false} replace>
              <List size={16} aria-hidden="true" />
            </Link>
            <Link href={href({ view: "grid" })} aria-current={view === "grid" ? "page" : undefined} aria-label="Vista griglia" title="Griglia" scroll={false} replace>
              <LayoutGrid size={16} aria-hidden="true" />
            </Link>
          </nav>
          <ActionMenu
            label="Altre opzioni della rubrica"
            items={[
              {
                label: "Nuovo cliente",
                icon: <Plus size={16} aria-hidden="true" />,
                onSelect: onCreate,
                disabledReason: permissions.write ? undefined : permissionDeniedMessage.member,
              },
              {
                label: "Importa contatti",
                icon: <Download size={16} aria-hidden="true" />,
                onSelect: onImport,
                disabledReason: permissions.importCsv ? undefined : "L'importazione CSV è riservata ad amministratori e proprietario.",
              },
              {
                label: "Azzera filtri",
                icon: <RotateCcw size={16} aria-hidden="true" />,
                onSelect: () => router.replace(href({ q: null, kind: null, filter: null, page: null, sort: null }), { scroll: false }),
              },
            ]}
          />
        </div>
      </header>

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
        <label className="cl-kind">
          <span className="visually-hidden">Filtra per tipo</span>
          <select
            value={kind}
            onChange={(event) => router.replace(href({ kind: event.target.value === "all" ? null : event.target.value, page: null }), { scroll: false })}
          >
            <option value="all">Tutti i tipi</option>
            <option value="azienda">{clientKindLabel.azienda}</option>
            <option value="privato">{clientKindLabel.privato}</option>
          </select>
          <ListFilter size={16} aria-hidden="true" />
        </label>
      </div>

      {selection.length > 0 && permissions.write ? (
        <div className="cl-bulk" role="region" aria-label="Clienti selezionati">
          <span>
            <strong>{selection.length}</strong> {selection.length === 1 ? "selezionato" : "selezionati"}
          </span>
          <Button
            variant="secondary"
            loading={pending}
            onClick={() => run(() => archiveClientsAction(selection, archiving), () => setChecked([]))}
          >
            {archiving ? <Archive size={16} aria-hidden="true" /> : <ArchiveRestore size={16} aria-hidden="true" />}
            {archiving ? "Archivia" : "Ripristina"}
          </Button>
          <Button variant="ghost" onClick={() => setChecked([])}>
            Annulla
          </Button>
        </div>
      ) : null}

      {list.items.length === 0 ? (
        <div className="list-empty">
          <Users size={22} aria-hidden="true" />
          <p>{hasAny ? "Nessun cliente corrisponde a ricerca e filtri." : "La rubrica è vuota. Aggiungi il primo cliente o importa un CSV."}</p>
          {hasAny && filtered ? (
            <Link className="btn btn-secondary" href="/app/clients" replace>
              Azzera filtri
            </Link>
          ) : null}
        </div>
      ) : view === "grid" ? (
        <ul className="cl-grid">
          {list.items.map((client) => (
            <li key={client.id} className={cn("cl-tile", client.id === selectedId && "is-selected")}>
              <Link href={href({ id: client.id })} className="cl-tile-link" aria-current={client.id === selectedId ? "true" : undefined} scroll={false}>
                <ClientAvatar name={client.name} />
                <strong className="clamp-1">{client.name}</strong>
                <span className="muted small clamp-1">{client.sector ?? clientKindLabel[client.kind]}</span>
              </Link>
              <div className="cl-tile-foot">
                <StatusBadge tone={statusTone[client.status]}>{statusShort[client.status]}</StatusBadge>
                <span className="muted small">
                  {client.quoteCount} {client.quoteCount === 1 ? "preventivo" : "preventivi"}
                </span>
                {rowMenu(client)}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="cl-table-wrap">
          <table className="cl-table">
            <thead>
              <tr>
                <th className="cl-check" scope="col">
                  <input
                    type="checkbox"
                    aria-label="Seleziona tutti i clienti della pagina"
                    checked={allChecked}
                    onChange={() => setChecked(allChecked ? [] : visibleIds)}
                  />
                </th>
                <th scope="col" aria-sort={sort === "name" ? "ascending" : sort === "-name" ? "descending" : "none"}>
                  <Link className="cl-sort" href={href({ sort: sort === "name" ? "-name" : null, page: null })} scroll={false} replace>
                    Cliente
                    {sort === "-name" ? <ArrowDown size={13} aria-hidden="true" /> : sort === "name" ? <ArrowUp size={13} aria-hidden="true" /> : null}
                  </Link>
                </th>
                <th scope="col">Tipo</th>
                <th scope="col">Stato</th>
                <th scope="col" className="num">
                  Preventivi
                </th>
                <th scope="col" aria-sort={sort === "updated" ? "descending" : sort === "-updated" ? "ascending" : "none"}>
                  <Link className="cl-sort" href={href({ sort: sort === "updated" ? "-updated" : "updated", page: null })} scroll={false} replace>
                    Ultimo aggiornamento
                    {sort === "updated" ? <ArrowDown size={13} aria-hidden="true" /> : sort === "-updated" ? <ArrowUp size={13} aria-hidden="true" /> : null}
                  </Link>
                </th>
                <th scope="col">
                  <span className="visually-hidden">Azioni</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {list.items.map((client) => {
                const isSelected = client.id === selectedId;
                return (
                  <tr key={client.id} className={cn(isSelected && "is-selected", selection.includes(client.id) && "is-checked")}>
                    <td className="cl-check">
                      <input
                        type="checkbox"
                        aria-label={`Seleziona ${client.name}`}
                        checked={selection.includes(client.id)}
                        onChange={() => toggle(client.id)}
                      />
                    </td>
                    <td>
                      <Link href={href({ id: client.id })} className="cl-name" aria-current={isSelected ? "true" : undefined} scroll={false}>
                        <ClientAvatar name={client.name} />
                        <span className="cl-name-text">
                          <strong className="clamp-1">{client.name}</strong>
                          <span className="muted small clamp-1">{client.email ?? client.sector ?? "Nessuna email"}</span>
                        </span>
                      </Link>
                    </td>
                    <td className="muted">{clientKindLabel[client.kind]}</td>
                    <td>
                      <StatusBadge tone={statusTone[client.status]}>{statusShort[client.status]}</StatusBadge>
                      <span className="visually-hidden">{clientStatusLabel[client.status]}</span>
                    </td>
                    <td className="num">{client.quoteCount}</td>
                    <td className="muted">{updatedFormat.format(client.updatedAt)}</td>
                    <td className="cl-row-menu">{rowMenu(client)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <Pagination page={list.page} pageSize={list.pageSize} total={list.total} noun="clienti" />
      <ClientFormDialog open={editing !== null} onClose={() => setEditing(null)} client={editing} />
    </motion.section>
  );
}
