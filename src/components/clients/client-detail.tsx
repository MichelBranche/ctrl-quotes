"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Archive,
  ArchiveRestore,
  AtSign,
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
import type { ClientContact, ClientDetail } from "@/server/clients";
import type { ClientPermissions } from "@/components/clients/clients-view";

const dateFormat = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Rome" });

type Tab = "overview" | "contacts" | "notes";

export function ClientDetailPanel({ client, permissions }: { client: ClientDetail; permissions: ClientPermissions }) {
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
    { id: "contacts", label: "Referenti", count: client.contacts.length },
    { id: "notes", label: "Note", count: client.notes.length },
  ];

  return (
    <article className="card detail-card">
      <header className="detail-header">
        <ClientAvatar name={client.name} />
        <div className="detail-title">
          <div className="detail-title-row">
            <h2>{client.name}</h2>
            <StatusBadge tone={client.status === "active" ? "success" : client.status === "prospect" ? "info" : "draft"}>
              {clientStatusLabel[client.status]}
            </StatusBadge>
          </div>
          <p className="muted">
            {client.sector ?? clientKindLabel[client.kind]}
            {client.vatNumber ? ` · P. IVA ${client.vatNumber}` : ""}
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
          <div className="detail-grid">
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
              <dl className="info-list">
                <InfoRow icon={<UserRound size={16} />} label="Referente" value={primary ? primary.name : null} sub={primary?.roleLabel} />
                <InfoRow icon={<AtSign size={16} />} label="Email" value={client.email} href={client.email ? `mailto:${client.email}` : undefined} />
                <InfoRow icon={<Phone size={16} />} label="Telefono" value={client.phone} href={client.phone ? `tel:${client.phone.replace(/\s/g, "")}` : undefined} />
                <InfoRow icon={<Globe size={16} />} label="Sito web" value={client.website?.replace(/^https?:\/\//, "") ?? null} href={client.website ?? undefined} external />
                <InfoRow icon={<MapPin size={16} />} label="Indirizzo" value={client.address} />
                <InfoRow icon={<FileText size={16} />} label="Codice fiscale" value={client.taxCode} />
              </dl>
            </section>
            <div className="stack-tight">
              <section className="card inset">
                <SectionTitle icon={<FileText size={16} aria-hidden="true" />}>Preventivi</SectionTitle>
                <p className="muted small">
                  Ancora nessun preventivo per questo cliente. La creazione dei preventivi arriva con il motore preventivi, nella prossima fase.
                </p>
              </section>
              <section className="card inset">
                <SectionTitle
                  icon={<NotebookPen size={16} aria-hidden="true" />}
                  action={
                    <button type="button" className="link-btn" onClick={() => setTab("notes")}>
                      {client.notes.length ? "Tutte le note" : "Aggiungi nota"}
                    </button>
                  }
                >
                  Note
                </SectionTitle>
                {client.notes[0] ? (
                  <>
                    <p className="note-preview">{client.notes[0].body}</p>
                    <p className="muted small">Ultima modifica: {dateFormat.format(client.notes[0].createdAt)}</p>
                  </>
                ) : (
                  <p className="muted small">Nessuna nota interna.</p>
                )}
              </section>
              <p className="muted small">
                Creato il {dateFormat.format(client.createdAt)} · aggiornato il {dateFormat.format(client.updatedAt)}
              </p>
            </div>
          </div>
        ) : null}
        {tab === "contacts" ? <ContactsTab client={client} canWrite={permissions.write} /> : null}
        {tab === "notes" ? <NotesTab client={client} canWrite={permissions.write} /> : null}
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
