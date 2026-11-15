"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { ArrowRight, Bell, LogOut, Menu, PanelLeftClose, PanelLeftOpen, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { PageTransition } from "@/components/motion/page-transition";
import { SectionTransitionProvider } from "@/components/motion/section-transition";
import { AnchoredPopover } from "@/components/ui/anchored-popover";
import { Drawer } from "@/components/ui/overlays";
import { SideNav } from "@/components/shell/nav";
import { BILLING_PATH, currentPlanLabel, trialDaysRemainingLabel } from "@/domain/plans";
import type { ShellData } from "@/components/shell/types";
import { messages } from "@/i18n/it";
import { cn } from "@/lib/cn";
import { DeleteWorkspaceDialog, type DeleteWorkspaceTarget } from "@/components/workspace/delete-workspace-dialog";
import { hasRole } from "@/domain/roles";
import { logoutAction, switchWorkspaceAction } from "@/server/actions";
import { markNotificationsReadAction } from "@/server/actions/notifications";
import type { ShellNotification } from "@/components/shell/types";

const COLLAPSE_KEY = "cq-sidebar-collapsed";
const collapseListeners = new Set<() => void>();

/** Sidebar expanded or compact, remembered in this browser. Server render is always expanded. */
function useCollapsed(): [boolean, (value: boolean) => void] {
  const collapsed = useSyncExternalStore(
    (listener) => {
      collapseListeners.add(listener);
      return () => collapseListeners.delete(listener);
    },
    () => window.localStorage.getItem(COLLAPSE_KEY) === "1",
    () => false,
  );
  const set = (value: boolean) => {
    window.localStorage.setItem(COLLAPSE_KEY, value ? "1" : "0");
    collapseListeners.forEach((listener) => listener());
  };
  return [collapsed, set];
}

export function AppShell({ data, children }: { data: ShellData; children: React.ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useCollapsed();
  const [deleteTarget, setDeleteTarget] = useState<DeleteWorkspaceTarget | null>(null);
  const canDeleteAny = data.workspaces.length > 1;

  return (
    // One transition provider for the whole app: every in-app link (sidebar, logo, cards) tears the current view down
    // before navigating, and every view builds up on arrival (section-transition.tsx).
    <SectionTransitionProvider interceptLinks>
      <div className={cn("shell", collapsed && "is-collapsed")}>
        <a className="skip-link visually-hidden" href="#content">
          {messages.skip}
        </a>
        <aside className="sidebar sidebar-desktop">
          <div className="sb-brand">
            <Link href="/app/overview" className="sb-logo" aria-label={`${messages.brand}, ${messages.shell.overview}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="logo-full" src="/brand/logo.png" alt="" width={126} height={28} />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="logo-icon" src="/brand/icon-compact.png" alt="" width={34} height={34} />
            </Link>
            <button
              type="button"
              className="sb-toggle"
              onClick={() => setCollapsed(!collapsed)}
              aria-label={collapsed ? "Espandi la barra laterale" : "Riduci la barra laterale"}
              aria-pressed={collapsed}
              title={collapsed ? "Espandi" : "Riduci"}
            >
              {collapsed ? <PanelLeftOpen size={16} aria-hidden="true" /> : <PanelLeftClose size={16} aria-hidden="true" />}
            </button>
          </div>
          <SideNav compact={collapsed} />
          <div className="sb-foot">
            <PlanCard workspace={data.workspace} />
            <Link className="btn-new" href="/app/quotes/new" title={collapsed ? messages.quotes.action : undefined}>
              <Plus size={18} aria-hidden="true" />
              <span>{messages.quotes.action}</span>
            </Link>
          </div>
        </aside>
        <div className="main-col">
          <header className="topbar">
            <button type="button" className="tb-icon menu-btn" aria-label={messages.shell.openMenu} onClick={() => setMenuOpen(true)}>
              <Menu size={18} aria-hidden="true" />
            </button>
            <form className="tb-search" action="/app/quotes" role="search">
              <Search size={16} aria-hidden="true" />
              <input type="search" name="q" placeholder="Cerca preventivi, clienti, servizi…" aria-label="Cerca nei preventivi" maxLength={100} />
            </form>
            <NotificationBell items={data.notifications} />
            <AnchoredPopover
              id="account-menu"
              trigger={
                <button type="button" className="avatar" aria-label={`${data.user.initials}, ${messages.shell.account}`}>
                  {data.user.initials}
                </button>
              }
            >
              <p style={{ margin: "8px 10px" }}>
                <strong>{data.user.name}</strong>
                <br />
                <span className="muted">{data.user.email}</span>
              </p>
              <p className="menu-label">{messages.shell.workspace}</p>
              {data.workspaces.map((workspace) => {
                const isCurrent = workspace.id === data.workspace.id;
                const canEdit = hasRole(workspace.role, "admin");
                const canDelete = workspace.role === "owner";
                return (
                  <div key={workspace.id} className="ws-menu-item">
                    <form action={switchWorkspaceAction} className="ws-menu-switch">
                      <input type="hidden" name="workspaceId" value={workspace.id} />
                      <button type="submit" aria-current={isCurrent ? "true" : undefined}>
                        {workspace.name}
                        {isCurrent ? <span className="ws-menu-current">{messages.shell.currentWorkspace}</span> : null}
                      </button>
                    </form>
                    <div className="ws-menu-acts">
                      {canEdit ? (
                        isCurrent ? (
                          <Link href="/app/settings/profile" title={messages.shell.editWorkspace} aria-label={messages.shell.editWorkspace}>
                            <Pencil size={14} aria-hidden="true" />
                          </Link>
                        ) : (
                          <form action={switchWorkspaceAction}>
                            <input type="hidden" name="workspaceId" value={workspace.id} />
                            <input type="hidden" name="next" value="/app/settings/profile" />
                            <button type="submit" title={messages.shell.editWorkspace} aria-label={messages.shell.editWorkspace}>
                              <Pencil size={14} aria-hidden="true" />
                            </button>
                          </form>
                        )
                      ) : null}
                      {canDelete ? (
                        <button
                          type="button"
                          className="is-danger"
                          title={canDeleteAny ? messages.shell.deleteWorkspace : messages.workspace.lastWorkspace}
                          aria-label={messages.shell.deleteWorkspace}
                          disabled={!canDeleteAny}
                          onClick={() => {
                            if (canDeleteAny) setDeleteTarget({ id: workspace.id, name: workspace.name });
                          }}
                        >
                          <Trash2 size={14} aria-hidden="true" />
                        </button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
              <Link href="/app/workspace">{messages.shell.manageWorkspaces}</Link>
              <Link href="/onboarding">
                <Plus size={16} aria-hidden="true" /> {messages.shell.newWorkspace}
              </Link>
              <form action={logoutAction}>
                <button type="submit">
                  <LogOut size={16} aria-hidden="true" /> {messages.shell.logout}
                </button>
              </form>
            </AnchoredPopover>
          </header>
          <main id="content" tabIndex={-1} className="page">
            <TrialBanner workspace={data.workspace} />
            <PageTransition>{children}</PageTransition>
          </main>
        </div>
        <Drawer open={menuOpen} title={messages.shell.openMenu} onClose={() => setMenuOpen(false)}>
          <SideNav onNavigate={() => setMenuOpen(false)} />
          <div className="sb-foot">
            <PlanCard workspace={data.workspace} />
            <Link className="btn-new" href="/app/quotes/new" onClick={() => setMenuOpen(false)}>
              <Plus size={18} aria-hidden="true" />
              <span>{messages.quotes.action}</span>
            </Link>
          </div>
        </Drawer>
        <DeleteWorkspaceDialog target={deleteTarget} onClose={() => setDeleteTarget(null)} />
      </div>
    </SectionTransitionProvider>
  );
}

function PlanCard({ workspace }: { workspace: ShellData["workspace"] }) {
  const title = workspace.trialExpired
    ? "Prova terminata"
    : workspace.trialActive
      ? trialDaysRemainingLabel(workspace.trialDaysLeft)
      : currentPlanLabel(workspace.plan, workspace.planOverride);
  const body = workspace.trialExpired
    ? "Attiva un abbonamento per tornare a modificare i dati."
    : workspace.trialActive
      ? "Limiti del piano Pro, senza carta. I dati restano al sicuro dopo la scadenza."
      : messages.shell.planBody;
  const progress = workspace.trialActive || workspace.trialExpired
    ? Math.max(0, Math.min(1, 1 - workspace.trialDaysLeft / 7))
    : null;
  return (
    <>
      <section className="pro-card brand-fill">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="pro-quote" src="/brand/quote-marks.png" alt="" width={54} height={32} />
        <strong className="pro-title">{title}</strong>
        <p className="pro-text">{body}</p>
        {progress != null ? (
          <div className="pro-meter" aria-hidden="true">
            <span style={{ transform: `scaleX(${progress})` }} />
          </div>
        ) : null}
        <Link className="pro-btn" href={BILLING_PATH}>
          {workspace.trialExpired ? "Attiva un piano" : messages.shell.managePlan} <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </section>
      <Link className="pro-mini brand-fill" href={BILLING_PATH} aria-label={title} title={title}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/quote-marks.png" alt="" width={22} height={13} />
      </Link>
    </>
  );
}

function TrialBanner({ workspace }: { workspace: ShellData["workspace"] }) {
  if (workspace.trialExpired) {
    return (
      <p className="trial-banner is-expired" role="status">
        <span>La prova gratuita è terminata. Puoi consultare i dati già salvati. Per modificare e inviare, attiva un abbonamento.</span>
        <Link href={BILLING_PATH}>Vai all&apos;abbonamento</Link>
      </p>
    );
  }
  if (workspace.showReminderBanner) {
    const left = workspace.trialDaysLeft === 1 ? "1 giorno" : `${workspace.trialDaysLeft} giorni`;
    return (
      <p className="trial-banner is-warn" role="status">
        <span>La prova gratuita termina tra {left}. Attiva un piano per non interrompere il lavoro.</span>
        <Link href={BILLING_PATH}>Vai all&apos;abbonamento</Link>
      </p>
    );
  }
  return null;
}


const noticeDate = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" });

function NotificationBell({ items }: { items: ShellNotification[] }) {
  const [list, setList] = useState(items);
  const unread = list.filter((item) => !item.readAt);
  const pendingIds = useRef(unread.map((item) => item.id));

  useEffect(() => {
    const popover = document.getElementById("notifications");
    if (!popover) return;
    const onToggle = (event: Event) => {
      if ((event as ToggleEvent).newState !== "open") return;
      const ids = pendingIds.current;
      if (ids.length === 0) return;
      pendingIds.current = [];
      void markNotificationsReadAction(ids);
      const now = new Date().toISOString();
      setList((current) => current.map((item) => (item.readAt ? item : { ...item, readAt: now })));
    };
    popover.addEventListener("toggle", onToggle);
    return () => popover.removeEventListener("toggle", onToggle);
  }, []);

  return (
    <AnchoredPopover
      id="notifications"
      trigger={
        <button type="button" className="tb-icon tb-notify" aria-label={messages.shell.notifications}>
          <Bell size={18} aria-hidden="true" />
          {unread.length > 0 ? <span className="tb-notify-badge">{unread.length > 9 ? "9+" : unread.length}</span> : null}
        </button>
      }
    >
      {list.length === 0 ? (
        <p>{messages.shell.noNotifications}</p>
      ) : (
        <ul className="tb-notify-list">
          {list.map((item) => (
            <li key={item.id}>
              {item.href ? (
                <Link href={item.href} className={item.readAt ? undefined : "is-unread"}>
                  <strong>{item.title}</strong>
                  <span>{noticeDate.format(new Date(item.createdAt))}</span>
                </Link>
              ) : (
                <p className={item.readAt ? undefined : "is-unread"}>
                  <strong>{item.title}</strong>
                  <span>{noticeDate.format(new Date(item.createdAt))}</span>
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </AnchoredPopover>
  );
}
