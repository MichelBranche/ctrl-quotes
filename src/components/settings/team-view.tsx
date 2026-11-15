"use client";

import { useState } from "react";
import { Mail, ShieldCheck, Trash2 } from "lucide-react";
import { useAction } from "@/components/data/use-action";
import { SettingsFrame } from "@/components/settings/settings-frame";
import { Button } from "@/components/ui/button";
import { ClientAvatar } from "@/components/ui/data-display";
import { SelectField, TextField } from "@/components/ui/fields";
import { Dialog } from "@/components/ui/overlays";
import { StatusBadge } from "@/components/ui/status";
import { can, permissionMatrix } from "@/domain/permissions";
import { roleLabel, type Role } from "@/domain/roles";
import { inviteMemberAction, changeRoleAction, removeMemberAction, resendInviteAction, revokeInviteAction } from "@/server/actions/settings";
import { inviteRoleLabels, type PendingInvite, type SeatUsage } from "@/domain/invites";
import { overSeatCapMessage } from "@/domain/stripe-plans";
import type { Member } from "@/server/team";
import { HoldDelete } from "@/components/ui/destructive";


const dateFormat = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Rome" });

function formatDay(value: Date | string): string {
  return dateFormat.format(value instanceof Date ? value : new Date(value));
}

const capabilities: Array<{ label: string; permission: keyof typeof permissionMatrix }> = [
  { label: "Clienti, referenti, note e catalogo", permission: "clients.write" },
  { label: "Eliminare clienti e voci di catalogo", permission: "clients.delete" },
  { label: "Importare clienti da CSV", permission: "clients.import" },
  { label: "Brand Kit, impostazioni e template predefinito", permission: "brand.write" },
  { label: "Invitare membri", permission: "team.invite" },
  { label: "Rimuovere membri", permission: "team.remove" },
  { label: "Cambiare i ruoli", permission: "team.role" },
];

const rank: Record<Role, number> = { member: 1, admin: 2, owner: 3 };

export function TeamView({
  members,
  myRole,
  invites,
  seats,
}: {
  members: Member[];
  myRole: Role;
  invites: PendingInvite[];
  seats: SeatUsage;
}) {
  const [removing, setRemoving] = useState<Member | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"member" | "admin">("member");
  const { pending, error, run } = useAction();
  const canInvite = can(myRole, "team.invite");
  const seatsFull = seats.limit != null && seats.used >= seats.limit;
  const inviteHint = seatsFull
    ? `Hai raggiunto il limite di ${seats.limit} posti del ${seats.planLabel}.`
    : `${seats.quotaLabel} · ${seats.planLabel}. I posti includono i membri e gli inviti in attesa.`;

  return (
    <SettingsFrame
      section="team"
      plain
      title="Team e ruoli"
      subtitle={`Chi può accedere al workspace e con quali permessi. Il tuo ruolo: ${roleLabel(myRole)}.`}
      error={error}
      actions={
        <div className="save-area ss-hero-team-actions">
          <p className="ss-seats">{seats.quotaLabel}</p>
          {canInvite ? (
            <Button
              type="button"
              disabled={seatsFull}
              title={seatsFull ? inviteHint : "Invita una persona via email"}
              onClick={() => setInviteOpen(true)}
            >
              <Mail size={16} aria-hidden="true" /> Invita membro
            </Button>
          ) : null}
        </div>
      }
    >
      <div className="ss-cols is-team">
      <div className="stack-tight">
      <p className="field-hint ss-note">{inviteHint}</p>
      {seats.limit != null && seats.used > seats.limit ? <p className="alert" role="status">{overSeatCapMessage}</p> : null}
      <ul className="member-list">
        {members.map((member) => (
          <li key={member.userId} className="card inset member-row">
            <ClientAvatar name={member.name} />
            <div className="entity-main">
              <strong>
                {member.name}
                {member.isSelf ? <span className="muted small"> (tu)</span> : null}
              </strong>
              <span className="muted small">
                {member.email} · dal {formatDay(member.joinedAt)}
              </span>
            </div>
            {member.canChangeRole ? (
              <div className="field compact">
                <label className="visually-hidden" htmlFor={`role-${member.userId}`}>
                  Ruolo di {member.name}
                </label>
                <select
                  id={`role-${member.userId}`}
                  value={member.role}
                  disabled={pending}
                  onChange={(event) => run(() => changeRoleAction(member.userId, event.target.value))}
                >
                  <option value="admin">Amministratore</option>
                  <option value="member">Membro</option>
                </select>
              </div>
            ) : (
              <StatusBadge tone={member.role === "owner" ? "info" : "draft"}>{roleLabel(member.role)}</StatusBadge>
            )}
            {member.canRemove ? (
              <Button variant="ghost" aria-label={`Rimuovi ${member.name}`} onClick={() => setRemoving(member)}>
                <Trash2 size={16} aria-hidden="true" />
              </Button>
            ) : (
              <span className="row-spacer" aria-hidden="true" />
            )}
          </li>
        ))}
      </ul>
      {invites.length > 0 ? (
        <section className="team-pending">
          <h2 className="section-heading">Inviti in attesa</h2>
          <ul className="member-list">
            {invites.map((invite) => (
              <li key={invite.id} className="card inset member-row">
                <div className="entity-main">
                  <strong>{invite.email}</strong>
                  <span className="muted small">
                    {inviteRoleLabels[invite.role]} · {invite.expired ? "scaduto" : `scade il ${formatDay(invite.expiresAt)}`} · da {invite.invitedByName}
                  </span>
                </div>
                {invite.expired ? <StatusBadge tone="draft">Scaduto</StatusBadge> : <StatusBadge tone="info">In attesa</StatusBadge>}
                {canInvite ? (
                  <div className="row-actions">
                    <Button variant="ghost" disabled={pending} onClick={() => run(() => resendInviteAction(invite.id))}>
                      Invia di nuovo
                    </Button>
                    <Button variant="ghost" disabled={pending} onClick={() => run(() => revokeInviteAction(invite.id))}>
                      Revoca
                    </Button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      </div>

      <section className="card inset">
        <h2 className="section-heading">
          <ShieldCheck size={16} aria-hidden="true" /> Permessi per ruolo
        </h2>
        <div className="table-wrap" tabIndex={0} role="region" aria-label="Permessi per ruolo">
          <table className="data permissions-table">
            <caption className="visually-hidden">Permessi per ruolo</caption>
            <thead>
              <tr>
                <th scope="col">Operazione</th>
                <th scope="col">Membro</th>
                <th scope="col">Amministratore</th>
                <th scope="col">Proprietario</th>
              </tr>
            </thead>
            <tbody>
              {capabilities.map((capability) => (
                <tr key={capability.label}>
                  <th scope="row">{capability.label}</th>
                  {(["member", "admin", "owner"] as const).map((roleName) => (
                    <td key={roleName}>{rank[roleName] >= rank[permissionMatrix[capability.permission]] ? "Sì" : "No"}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="field-hint">I permessi sono verificati sul server a ogni operazione, non solo nell&apos;interfaccia.</p>
      </section>
      </div>

      <Dialog open={inviteOpen} title="Invita un membro" onClose={() => setInviteOpen(false)}>
        <form
          className="stack-tight team-invite-form"
          onSubmit={(event) => {
            event.preventDefault();
            run(() => inviteMemberAction({ email, role }), () => {
              setEmail("");
              setRole("member");
              setInviteOpen(false);
            });
          }}
        >
          <p className="field-hint">{inviteHint}</p>
          <TextField
            label="Email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="nome@azienda.it"
          />
          <SelectField
            label="Ruolo"
            name="role"
            value={role}
            onChange={(event) => setRole(event.target.value === "admin" ? "admin" : "member")}
            options={
              myRole === "owner"
                ? [
                    { value: "member", label: "Membro" },
                    { value: "admin", label: "Amministratore" },
                  ]
                : [{ value: "member", label: "Membro" }]
            }
          />
          <div className="dialog-actions">
            <Button type="button" variant="secondary" onClick={() => setInviteOpen(false)}>
              Annulla
            </Button>
            <Button type="submit" loading={pending} disabled={seatsFull}>
              Invia invito
            </Button>
          </div>
        </form>
      </Dialog>

      <Dialog open={removing !== null} title="Rimuovere il membro?" onClose={() => setRemoving(null)}>
        <p>{removing?.name} non potrà più accedere a questo workspace. I dati che ha creato restano.</p>
        <div className="dialog-actions">
          <Button variant="secondary" onClick={() => setRemoving(null)} autoFocus>
            Annulla
          </Button>
          <HoldDelete
            label="Tieni premuto per rimuovere"
            doneLabel="Rimosso"
            disabled={pending}
            onHold={() => {
              const target = removing;
              if (target) run(() => removeMemberAction(target.userId), () => setRemoving(null));
            }}
          />
        </div>
      </Dialog>
    </SettingsFrame>
  );
}
