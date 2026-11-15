"use client";

import { useState, type ReactNode } from "react";
import { motion } from "motion/react";
import { ArrowRight, Building2, Palette, Pencil, Plus, Trash2, Users } from "lucide-react";
import { FROM_BOTTOM, FROM_LEFT, FROM_RIGHT, FROM_TOP, useCardMotion } from "@/components/motion/card-motion";
import { SectionLink, useMoving, useSectionTransition } from "@/components/motion/section-transition";
import { DeleteWorkspaceDialog, type DeleteWorkspaceTarget } from "@/components/workspace/delete-workspace-dialog";
import { currentPlanLabel, type PlanId } from "@/domain/plans";
import { hasRole, roleLabel, type Role } from "@/domain/roles";
import { messages } from "@/i18n/it";
import { cn } from "@/lib/cn";
import { switchWorkspaceAction } from "@/server/actions";

export type WorkspaceCard = {
  id: string;
  name: string;
  slug: string;
  role: Role;
  plan: "free" | "starter" | "pro" | "studio";
  planOverride: PlanId | null;
  memberCount: number;
  logoAssetId: string | null;
};

function initials(name: string): string {
  const letters = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "");
  return letters.join("") || "W";
}

function membersLabel(count: number): string {
  return count === 1 ? "1 membro" : `${count} membri`;
}

export function WorkspaceView({
  currentId,
  workspaces,
}: {
  currentId: string;
  workspaces: WorkspaceCard[];
}) {
  const m = useCardMotion(6);
  const { visit, leaving } = useSectionTransition();
  const { moving, settle } = useMoving();
  const [deleteTarget, setDeleteTarget] = useState<DeleteWorkspaceTarget | null>(null);
  const current = workspaces.find((row) => row.id === currentId) ?? workspaces[0];
  const canDeleteAny = workspaces.length > 1;

  return (
    <div className="ws-page">
      <motion.header className="ws-head" {...m.head(leaving)}>
        <h1>{messages.workspace.title}</h1>
        <p>{messages.workspace.subtitle}</p>
      </motion.header>
      <motion.div
        key={visit}
        className={cn("ws-grid", leaving && "is-leaving", moving && "is-moving")}
        variants={m.grid}
        initial="hidden"
        animate={leaving ? "exit" : "show"}
        onAnimationComplete={settle}
      >
        <motion.section className="ws-hero" variants={m.item} custom={FROM_TOP}>
          <div className="ws-hero-copy">
            <h2>{messages.workspace.listTitle}</h2>
            <p>Ogni workspace ha i propri preventivi, clienti, catalogo e brand. Passa da uno all&apos;altro senza mescolare i dati.</p>
            <SectionLink href="/onboarding" className="ws-hero-btn">
              <Plus size={16} aria-hidden="true" /> {messages.shell.createWorkspace}
            </SectionLink>
          </div>
        </motion.section>

        {current ? (
          <motion.section className="ws-card ws-current" variants={m.item} custom={FROM_LEFT} whileHover={m.lift}>
            <p className="ws-kicker">{messages.workspace.currentTitle}</p>
            <div className="ws-current-head">
              <WorkspaceMark name={current.name} logoAssetId={current.logoAssetId} current />
              <div>
                <h3>{current.name}</h3>
                <p className="muted">{roleLabel(current.role)}</p>
              </div>
            </div>
            <dl className="ws-meta">
              <div>
                <dt>{messages.workspace.plan}</dt>
                <dd>{currentPlanLabel(current.plan, current.planOverride)}</dd>
              </div>
              <div>
                <dt>{messages.workspace.members}</dt>
                <dd>{membersLabel(current.memberCount)}</dd>
              </div>
            </dl>
            <SectionLink href="/app/settings/billing" className="ws-plan-link">
              {messages.workspace.managePlan} <ArrowRight size={16} aria-hidden="true" />
            </SectionLink>
          </motion.section>
        ) : null}

        <motion.section className="ws-card ws-list" variants={m.item} custom={FROM_RIGHT}>
          <div className="ws-list-head">
            <h3>{messages.workspace.listTitle}</h3>
            <SectionLink href="/onboarding" className="ws-list-create">
              <Plus size={16} aria-hidden="true" /> {messages.shell.createWorkspace}
            </SectionLink>
          </div>
          <ul className="ws-list-body">
            {workspaces.map((workspace) => {
              const isCurrent = workspace.id === currentId;
              const canEdit = hasRole(workspace.role, "admin");
              const canDelete = workspace.role === "owner";
              return (
                <li key={workspace.id} className={cn("ws-row", isCurrent && "is-current")}>
                  <WorkspaceMark name={workspace.name} logoAssetId={isCurrent ? workspace.logoAssetId : null} current={isCurrent} />
                  <div className="ws-row-copy">
                    <strong>{workspace.name}</strong>
                    <span className="muted">
                      {roleLabel(workspace.role)} · {membersLabel(workspace.memberCount)}
                    </span>
                  </div>
                  {isCurrent ? <span className="ws-badge">{messages.shell.currentWorkspace}</span> : null}
                  <div className="ws-row-acts">
                    {isCurrent ? null : (
                      <form action={switchWorkspaceAction}>
                        <input type="hidden" name="workspaceId" value={workspace.id} />
                        <input type="hidden" name="next" value="/app/workspace" />
                        <button type="submit" className="btn btn-secondary btn-sm">
                          {messages.shell.switchWorkspace}
                        </button>
                      </form>
                    )}
                    {canEdit ? (
                      isCurrent ? (
                        <SectionLink href="/app/settings/profile" className="ws-icon-btn" title={messages.shell.editWorkspace} aria-label={messages.shell.editWorkspace}>
                          <Pencil size={16} aria-hidden="true" />
                        </SectionLink>
                      ) : (
                        <form action={switchWorkspaceAction}>
                          <input type="hidden" name="workspaceId" value={workspace.id} />
                          <input type="hidden" name="next" value="/app/settings/profile" />
                          <button type="submit" className="ws-icon-btn" title={messages.shell.editWorkspace} aria-label={messages.shell.editWorkspace}>
                            <Pencil size={16} aria-hidden="true" />
                          </button>
                        </form>
                      )
                    ) : null}
                    {canDelete ? (
                      <button
                        type="button"
                        className="ws-icon-btn is-danger"
                        title={canDeleteAny ? messages.shell.deleteWorkspace : messages.workspace.lastWorkspace}
                        aria-label={messages.shell.deleteWorkspace}
                        disabled={!canDeleteAny}
                        onClick={() => {
                          if (canDeleteAny) setDeleteTarget({ id: workspace.id, name: workspace.name });
                        }}
                      >
                        <Trash2 size={16} aria-hidden="true" />
                      </button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </motion.section>

        <motion.div className="ws-links" variants={m.item} custom={FROM_BOTTOM}>
          <QuickLink href="/app/settings/profile" icon={<Building2 size={22} />} title={messages.workspace.profileLink} body={messages.workspace.profileBody} />
          <QuickLink href="/app/settings/team" icon={<Users size={22} />} title={messages.workspace.teamLink} body={messages.workspace.teamBody} />
          <QuickLink href="/app/settings/brand" icon={<Palette size={22} />} title={messages.workspace.brandLink} body={messages.workspace.brandBody} />
        </motion.div>
      </motion.div>
      <DeleteWorkspaceDialog target={deleteTarget} onClose={() => setDeleteTarget(null)} />
    </div>
  );
}

function WorkspaceMark({ name, logoAssetId, current }: { name: string; logoAssetId: string | null; current: boolean }) {
  if (current && logoAssetId) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img className="ws-mark" src={`/api/assets/${logoAssetId}`} alt="" width={44} height={44} />
    );
  }
  return (
    <span className="ws-mark is-initials" aria-hidden="true">
      {initials(name)}
    </span>
  );
}

function QuickLink({ href, icon, title, body }: { href: string; icon: ReactNode; title: string; body: string }) {
  return (
    <div className="ws-card ws-link">
      <SectionLink href={href} className="ws-link-inner">
        <span className="ws-link-icon" aria-hidden="true">
          {icon}
        </span>
        <span className="ws-link-copy">
          <span className="ws-link-title">{title}</span>
          <span className="ws-link-body">{body}</span>
        </span>
        <span className="ws-link-arrow" aria-hidden="true">
          <ArrowRight size={18} />
        </span>
      </SectionLink>
    </div>
  );
}
