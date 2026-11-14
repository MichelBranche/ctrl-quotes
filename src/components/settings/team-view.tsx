"use client";

import { useState } from "react";
import { Mail, ShieldCheck, Trash2 } from "lucide-react";
import { useAction } from "@/components/data/use-action";
import { SettingsFrame } from "@/components/settings/settings-frame";
import { Button } from "@/components/ui/button";
import { ClientAvatar } from "@/components/ui/data-display";
import { Dialog } from "@/components/ui/overlays";
import { StatusBadge } from "@/components/ui/status";
import { permissionMatrix } from "@/domain/permissions";
import { roleLabel, type Role } from "@/domain/roles";
import { changeRoleAction, removeMemberAction } from "@/server/actions/settings";
import type { Member } from "@/server/team";

const dateFormat = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Rome" });

const capabilities: Array<{ label: string; permission: keyof typeof permissionMatrix }> = [
  { label: "Clienti, referenti, note e catalogo", permission: "clients.write" },
  { label: "Eliminare clienti e voci di catalogo", permission: "clients.delete" },
  { label: "Importare clienti da CSV", permission: "clients.import" },
  { label: "Brand Kit, impostazioni e template predefinito", permission: "brand.write" },
  { label: "Rimuovere membri", permission: "team.remove" },
  { label: "Cambiare i ruoli", permission: "team.role" },
];

const rank: Record<Role, number> = { member: 1, admin: 2, owner: 3 };

export function TeamView({ members, myRole }: { members: Member[]; myRole: Role }) {
  const [removing, setRemoving] = useState<Member | null>(null);
  const { pending, error, run } = useAction();

  return (
    <SettingsFrame
      section="team"
      plain
      title="Team e ruoli"
      subtitle={`Chi può accedere al workspace e con quali permessi. Il tuo ruolo: ${roleLabel(myRole)}.`}
      error={error}
      actions={
        <div className="save-area">
          <Button disabled title="Gli inviti via email arrivano con l'invio dei preventivi.">
            <Mail size={16} aria-hidden="true" /> Invita membro
          </Button>
        </div>
      }
    >
      <div className="ss-cols is-team">
      <div className="stack-tight">
      <p className="field-hint ss-note">Gli inviti via email arrivano insieme all&apos;invio dei preventivi. Per ora puoi gestire ruoli e accessi dei membri già presenti.</p>
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
                {member.email} · dal {dateFormat.format(member.joinedAt)}
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
                  {(["member", "admin", "owner"] as const).map((role) => (
                    <td key={role}>{rank[role] >= rank[permissionMatrix[capability.permission]] ? "Sì" : "No"}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="field-hint">I permessi sono verificati sul server a ogni operazione, non solo nell&apos;interfaccia.</p>
      </section>
      </div>

      <Dialog open={removing !== null} title="Rimuovere il membro?" onClose={() => setRemoving(null)}>
        <p>{removing?.name} non potrà più accedere a questo workspace. I dati che ha creato restano.</p>
        <div className="dialog-actions">
          <Button variant="secondary" onClick={() => setRemoving(null)} autoFocus>
            Annulla
          </Button>
          <Button
            className="btn-danger"
            loading={pending}
            onClick={() => {
              const target = removing;
              if (target) run(() => removeMemberAction(target.userId), () => setRemoving(null));
            }}
          >
            Rimuovi
          </Button>
        </div>
      </Dialog>
    </SettingsFrame>
  );
}
