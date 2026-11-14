"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Archive,
  ArchiveRestore,
  AtSign,
  BadgeCheck,
  CircleDot,
  Eye,
  History,
  Receipt,
  Send,
  Shapes,
  ThumbsDown,
  ThumbsUp,
  Building2,
  FileText,
  Globe,
  MapPin,
  NotebookPen,
  Pencil,
  Phone,
  Plus,
  Star,
  Trash2,
  UserRound,
} from "lucide-react";
import { ClientFormDialog } from "@/components/clients/client-form";
import { useHref, SectionTitle } from "@/components/data/controls";
import { FormError, TextAreaField, text } from "@/components/data/fields";
import { ActionMenu } from "@/components/data/menu";
import { useAction } from "@/components/data/use-action";
import { Button } from "@/components/ui/button";
import { ClientAvatar } from "@/components/ui/data-display";
import { TextField } from "@/components/ui/fields";
import { Dialog } from "@/components/ui/overlays";
import { StatusBadge } from "@/components/ui/status";
import { clientKindLabel, clientStatusLabel } from "@/domain/clients";
import { permissionDeniedMessage } from "@/domain/permissions";
import {
  addNoteAction,
  archiveClientAction,
  deleteClientAction,
  deleteContactAction,
  deleteNoteAction,
  saveContactAction,
} from "@/server/actions/clients";
import type { ClientContact, ClientDetail, ClientEvent } from "@/server/clients";
import { statusTone, type ClientPermissions } from "@/components/clients/clients-view";
import { QuoteAmount } from "@/components/quotes/quotes-view";
import { quoteStatusLabel, quoteStatusTone } from "@/domain/quote-status";
import type { QuoteRow } from "@/server/quotes";

const dateFormat = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Rome" });

type Tab = "overview" | "quotes" | "notes" | "history";

export function ClientDetailPanel({
  client,
  permissions,
  quotes,
  timeline,
}: {
  client: ClientDetail;
  permissions: ClientPermissions;
  quotes: QuoteRow[];
  timeline: ClientEvent[];
}) {
  const [tab, setTab] = useState<Tab>("overview");
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { pending, run } = useAction();
  const router = useRouter();
  const href = useHref();
  const archived = client.status === "archived";
  const primary = client.contacts.find((contact) => contact.isPrimary) ?? client.contacts[0];
  const tabs: Array<{ id: Tab; label: string; count?: number }> = [
    { id: "overview", label: "Panoramica" },
    { id: "quotes", label: "Preventivi", count: quotes.length },
    { id: "notes", label: "Note", count: client.notes.length },
    { id: "history", label: "Storico" },
  ];

  return (
    <article className="card detail-card">
      <header className="detail-header cl-hero brand-fill">
        <ClientAvatar name={client.name} />
        <div className="detail-title">
          <div className="detail-title-row">
            <h2>{client.name}</h2>
            <StatusBadge tone={statusTone[client.status]}>{clientStatusLabel[client.status]}</StatusBadge>
          </div>
          <p>
            {clientKindLabel[client.kind]}
            {client.sector ? ` · ${client.sector}` : ""}
          </p>
        </div>
        <ActionMenu
          label={`Azioni per ${client.name}`}
          items={[
            {
              label: "Modifica",
              icon: <Pencil size={16} aria-hidden="true" />,
              onSelect: () => setEditing(true),
              disabledReason: permissions.write ? undefined : permissionDeniedMessage.member,
            },
            {
              label: archived ? "Ripristina" : "Archivia",
              icon: archived ? <ArchiveRestore size={16} aria-hidden="true" /> : <Archive size={16} aria-hidden="true" />,
              onSelect: () => run(() => archiveClientAction(client.id, !archived)),
              disabledReason: permissions.write ? undefined : permissionDeniedMessage.member,
            },
            {
              label: "Elimina",
              icon: <Trash2 size={16} aria-hidden="true" />,
              danger: true,
              onSelect: () => setConfirmDelete(true),
              disabledReason: permissions.remove ? undefined : "Solo amministratori e proprietario possono eliminare. Puoi archiviare il cliente.",
            },
          ]}
        />
      </header>

      <div className="tabs detail-tabs" role="tablist" aria-label="Sezioni del cliente">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            className="tab"
            id={`client-tab-${item.id}`}
            aria-controls={`client-panel-${item.id}`}
            aria-selected={tab === item.id}
            tabIndex={tab === item.id ? 0 : -1}
            onClick={() => setTab(item.id)}
            onKeyDown={(event) => {
              if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
              const index = tabs.findIndex((entry) => entry.id === tab);
              const next = tabs[(index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length];
              if (next) {
                setTab(next.id);
                document.getElementById(`client-tab-${next.id}`)?.focus();
              }
            }}
          >
            {item.label}
            {item.count ? <span className="count">{item.count}</span> : null}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`client-panel-${tab}`} aria-labelledby={`client-tab-${tab}`} className="tab-panel">
        {tab === "overview" ? (
          <div className="stack-tight">
            <section className="card inset">
              <SectionTitle
                icon={<Building2 size={16} aria-hidden="true" />}
                action={
                  permissions.write ? (
                    <button type="button" className="link-btn" onClick={() => setEditing(true)}>
                      <Pencil size={14} aria-hidden="true" /> Modifica
                    </button>
                  ) : undefined
                }
              >
                Informazioni cliente
              </SectionTitle>
              <dl className="info-list cl-info">
                <InfoRow icon={<Shapes size={16} />} label="Tipologia" value={clientKindLabel[client.kind]} />
                <InfoRow icon={<CircleDot size={16} />} label="Stato" value={clientStatusLabel[client.status]} />
                <InfoRow icon={<AtSign size={16} />} label="Email" value={client.email} href={client.email ? `mailto:${client.email}` : undefined} />
                <InfoRow icon={<Phone size={16} />} label="Telefono" value={client.phone} href={client.phone ? `tel:${client.phone.replace(/\s/g, "")}` : undefined} />
                <InfoRow icon={<Receipt size={16} />} label="P. IVA" value={client.vatNumber} />
                <InfoRow icon={<MapPin size={16} />} label="Indirizzo" value={client.address} />
                <InfoRow icon={<Globe size={16} />} label="Sito web" value={client.website?.replace(/^https?:\/\//, "") ?? null} href={client.website ?? undefined} external />
                <InfoRow icon={<FileText size={16} />} label="Codice fiscale" value={client.taxCode} />
                <InfoRow icon={<UserRound size={16} />} label="Referente" value={primary ? primary.name : null} sub={primary?.roleLabel} />
              </dl>
            </section>
            <ClientQuotes client={client} quotes={quotes} canCreate={permissions.createQuote && !archived} limit={3} onAll={() => setTab("quotes")} />
            <ContactsTab client={client} canWrite={permissions.write} />
            <p className="muted small">
              Creato il {dateFormat.format(client.createdAt)} · aggiornato il {dateFormat.format(client.updatedAt)}
            </p>
          </div>
        ) : null}
        {tab === "quotes" ? <ClientQuotes client={client} quotes={quotes} canCreate={permissions.createQuote && !archived} limit={50} /> : null}
        {tab === "notes" ? <NotesTab client={client} canWrite={permissions.write} /> : null}
        {tab === "history" ? <HistoryTab events={timeline} /> : null}
      </div>

      <ClientFormDialog open={editing} onClose={() => setEditing(false)} client={client} />
      <Dialog open={confirmDelete} title="Eliminare il cliente?" onClose={() => setConfirmDelete(false)}>
        <p>
          {client.name} sparirà dalla rubrica insieme a referenti e note. Se vuoi solo toglierlo dalla lista, usa Archivia.
        </p>
        <div className="dialog-actions">
          <Button variant="secondary" onClick={() => setConfirmDelete(false)} autoFocus>
            Annulla
          </Button>
          <Button
            className="btn-danger"
            loading={pending}
            onClick={() =>
              run(
                () => deleteClientAction(client.id),
                () => {
                  setConfirmDelete(false);
                  router.replace(href({ id: null }), { scroll: false });
                },
              )
            }
          >
            Elimina
          </Button>
        </div>
      </Dialog>
    </article>
  );
}

function ClientQuotes({
  client,
  quotes,
  canCreate,
  limit,
  onAll,
}: {
  client: ClientDetail;
  quotes: QuoteRow[];
  canCreate: boolean;
  limit: number;
  onAll?: () => void;
}) {
  const newHref = `/app/quotes/new?client=${client.id}`;
  return (
    <section className="card inset" aria-label={limit < 50 ? "Preventivi recenti" : "Tutti i preventivi"}>
      <SectionTitle
        icon={<FileText size={16} aria-hidden="true" />}
        action={
          quotes.length > limit && onAll ? (
            <button type="button" className="link-btn" onClick={onAll}>
              Vedi tutti
            </button>
          ) : canCreate && quotes.length > 0 ? (
            <Link className="link-btn" href={newHref}>
              <Plus size={14} aria-hidden="true" /> Nuovo
            </Link>
          ) : undefined
        }
      >
        {limit < 50 ? "Preventivi recenti" : "Preventivi"} {quotes.length ? <span className="count">{quotes.length}</span> : null}
      </SectionTitle>
      {quotes.length === 0 ? (
        <div className="cl-quotes-empty">
          <picture>
            <source type="image/avif" srcSet="/illustrations/no-quotes-480.avif 480w, /illustrations/no-quotes-960.avif 960w" sizes="220px" />
            <source type="image/webp" srcSet="/illustrations/no-quotes-480.webp 480w, /illustrations/no-quotes-960.webp 960w" sizes="220px" />
            <img src="/illustrations/no-quotes-480.webp" alt="" width={480} height={320} decoding="async" loading="lazy" />
          </picture>
          <p className="muted small">Ancora nessun preventivo per questo cliente.</p>
          {canCreate ? (
            <Link className="btn btn-primary" href={newHref}>
              <Plus size={16} aria-hidden="true" /> Nuovo preventivo
            </Link>
          ) : null}
        </div>
      ) : (
        <ul className="client-quotes">
          {quotes.slice(0, limit).map((quote) => (
            <li key={quote.id}>
              <Link href={`/app/quotes/${quote.id}`} className="client-quote">
                <span className="client-quote-main">
                  <strong className="clamp-1">{quote.title}</strong>
                  <span className="muted small">
                    {quote.number ?? "Senza numero"} · {dateFormat.format(quote.updatedAt)}
                  </span>
                </span>
                <span className="client-quote-side">
                  <span className="client-quote-total">
                    <QuoteAmount row={quote} />
                  </span>
                  <StatusBadge tone={quoteStatusTone[quote.status]}>{quoteStatusLabel[quote.status]}</StatusBadge>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const eventIcon: Record<ClientEvent["kind"], React.ReactNode> = {
  client_created: <BadgeCheck size={15} aria-hidden="true" />,
  note_added: <NotebookPen size={15} aria-hidden="true" />,
  quote_created: <FileText size={15} aria-hidden="true" />,
  quote_sent: <Send size={15} aria-hidden="true" />,
  quote_viewed: <Eye size={15} aria-hidden="true" />,
  quote_accepted: <ThumbsUp size={15} aria-hidden="true" />,
  quote_rejected: <ThumbsDown size={15} aria-hidden="true" />,
};

const eventTimeFormat = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" });

function HistoryTab({ events }: { events: ClientEvent[] }) {
  return (
    <section className="card inset" aria-label="Storico del cliente">
      <SectionTitle icon={<History size={16} aria-hidden="true" />}>Storico</SectionTitle>
      <ol className="cl-timeline">
        {events.map((event, index) => (
          <li key={`${event.kind}-${event.at.getTime()}-${index}`} className={`is-${event.kind}`}>
            <span className="cl-timeline-ico">{eventIcon[event.kind]}</span>
            <span className="cl-timeline-main">
              {event.quoteId ? (
                <Link href={`/app/quotes/${event.quoteId}`} className="clamp-1">
                  {event.label}
                </Link>
              ) : (
                <span className="clamp-1">{event.label}</span>
              )}
              <time className="muted small" dateTime={event.at.toISOString()}>
                {eventTimeFormat.format(event.at)}
              </time>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function InfoRow({
  icon,
  label,
  value,
  sub,
  href,
  external,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | null;
  sub?: string | null;
  href?: string;
  external?: boolean;
}) {
  return (
    <div className="info-row">
      <dt>
        <span aria-hidden="true">{icon}</span>
        {label}
      </dt>
      <dd>
        {value ? (
          href ? (
            <a href={href} target={external ? "_blank" : undefined} rel={external ? "noopener noreferrer" : undefined}>
              {value}
            </a>
          ) : (
            value
          )
        ) : (
          <span className="muted">Non indicato</span>
        )}
        {sub ? <span className="muted small block">{sub}</span> : null}
      </dd>
    </div>
  );
}

function ContactsTab({ client, canWrite }: { client: ClientDetail; canWrite: boolean }) {
  const [editing, setEditing] = useState<ClientContact | "new" | null>(null);
  const { run, pending } = useAction();
  return (
    <section className="stack-tight">
      <SectionTitle
        action={
          canWrite ? (
            <Button variant="secondary" onClick={() => setEditing("new")}>
              <Plus size={16} aria-hidden="true" /> Aggiungi referente
            </Button>
          ) : undefined
        }
      >
        Referenti
      </SectionTitle>
      {client.contacts.length === 0 ? (
        <p className="muted small">Nessun referente. Aggiungi chi riceverà i preventivi per questo cliente.</p>
      ) : (
        <ul className="contact-list">
          {client.contacts.map((contact) => (
            <li key={contact.id} className="card inset contact-card">
              <div>
                <strong>
                  {contact.name}
                  {contact.isPrimary ? (
                    <span className="badge badge-info">
                      <Star size={12} aria-hidden="true" /> Principale
                    </span>
                  ) : null}
                </strong>
                {contact.roleLabel ? <span className="muted small block">{contact.roleLabel}</span> : null}
                <span className="small block">
                  {[contact.email, contact.phone].filter(Boolean).join(" · ") || <span className="muted">Nessun recapito</span>}
                </span>
              </div>
              {canWrite ? (
                <div className="row-actions">
                  <Button variant="ghost" onClick={() => setEditing(contact)} aria-label={`Modifica ${contact.name}`}>
                    <Pencil size={16} aria-hidden="true" />
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={pending}
                    onClick={() => run(() => deleteContactAction(client.id, contact.id))}
                    aria-label={`Elimina ${contact.name}`}
                  >
                    <Trash2 size={16} aria-hidden="true" />
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <ContactDialog clientId={client.id} contact={editing === "new" ? null : editing} open={editing !== null} onClose={() => setEditing(null)} />
    </section>
  );
}

function ContactDialog({
  clientId,
  contact,
  open,
  onClose,
}: {
  clientId: string;
  contact: ClientContact | null;
  open: boolean;
  onClose: () => void;
}) {
  const { pending, error, setError, run } = useAction();
  return (
    <Dialog
      open={open}
      title={contact ? "Modifica referente" : "Nuovo referente"}
      onClose={() => {
        setError(null);
        onClose();
      }}
    >
      {open ? (
        <form
          className="form-grid"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const input = {
              name: text(form, "name"),
              email: text(form, "email"),
              phone: text(form, "phone"),
              roleLabel: text(form, "roleLabel"),
              isPrimary: form.get("isPrimary") === "on",
            };
            run(() => saveContactAction(clientId, contact?.id ?? null, input), onClose);
          }}
        >
          <FormError message={error} />
          <TextField label="Nome e cognome" name="name" required minLength={2} defaultValue={contact?.name ?? ""} autoFocus />
          <TextField label="Ruolo" name="roleLabel" defaultValue={contact?.roleLabel ?? ""} placeholder="Per esempio: direttore creativo" />
          <div className="grid-2">
            <TextField label="Email" name="email" type="email" defaultValue={contact?.email ?? ""} />
            <TextField label="Telefono" name="phone" type="tel" defaultValue={contact?.phone ?? ""} />
          </div>
          <label className="checkline">
            <input type="checkbox" name="isPrimary" defaultChecked={contact?.isPrimary ?? false} /> Referente principale
          </label>
          <div className="dialog-actions">
            <Button variant="secondary" onClick={onClose}>
              Annulla
            </Button>
            <Button type="submit" loading={pending}>
              Salva referente
            </Button>
          </div>
        </form>
      ) : null}
    </Dialog>
  );
}

function NotesTab({ client, canWrite }: { client: ClientDetail; canWrite: boolean }) {
  const { pending, error, run } = useAction();
  const [draft, setDraft] = useState("");
  return (
    <section className="stack-tight">
      {canWrite ? (
        <form
          className="note-form"
          onSubmit={(event) => {
            event.preventDefault();
            run(() => addNoteAction(client.id, { body: draft }), () => setDraft(""));
          }}
        >
          <FormError message={error} />
          <TextAreaField
            label="Nuova nota interna"
            hint="Le note sono visibili solo ai membri del workspace, mai al cliente."
            value={draft}
            maxLength={2000}
            onChange={(event) => setDraft(event.target.value)}
          />
          <Button type="submit" loading={pending} disabled={draft.trim() === ""}>
            Aggiungi nota
          </Button>
        </form>
      ) : null}
      {client.notes.length === 0 ? (
        <p className="muted small">Nessuna nota interna.</p>
      ) : (
        <ol className="note-list">
          {client.notes.map((note) => (
            <li key={note.id} className="card inset">
              <p>{note.body}</p>
              <div className="note-meta">
                <span className="muted small">
                  {note.authorName ?? "Utente rimosso"} · {dateFormat.format(note.createdAt)}
                </span>
                {note.canDelete ? (
                  <Button variant="ghost" onClick={() => run(() => deleteNoteAction(client.id, note.id))} aria-label="Elimina nota" disabled={pending}>
                    <Trash2 size={16} aria-hidden="true" />
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
