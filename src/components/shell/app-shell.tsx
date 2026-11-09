"use client";

import { useState } from "react";
import Link from "next/link";
import { Bell, CalendarDays, ChevronDown, LogOut, Menu, Plus } from "lucide-react";
import { Logo } from "@/components/logo";
import { PageTransition } from "@/components/motion/page-transition";
import { Drawer } from "@/components/ui/overlays";
import { SideNav } from "@/components/shell/nav";
import type { ShellData } from "@/components/shell/types";
import { messages } from "@/i18n/it";
import { logoutAction, switchWorkspaceAction } from "@/server/actions";

export function AppShell({ data, children }: { data: ShellData; children: React.ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [planNote, setPlanNote] = useState(false);
  const initial = data.workspace.name.slice(0, 1).toUpperCase();

  return (
    <div className="shell">
      <a className="skip-link visually-hidden" href="#content">
        {messages.skip}
      </a>
      <aside className="sidebar sidebar-desktop">
        <Link href="/app/overview" className="brand-lockup">
          <Logo />
        </Link>
        <WorkspaceSwitcher data={data} initial={initial} menuId="desktop-workspace-menu" />
        <SideNav />
        <div className="sidebar-spacer" />
        <PlanCard open={planNote} onOpen={() => setPlanNote(true)} />
      </aside>
      <div className="main-col">
        <header className="topbar">
          <button type="button" className="btn btn-secondary menu-btn" aria-label={messages.shell.openMenu} onClick={() => setMenuOpen(true)}>
            <Menu size={18} aria-hidden="true" />
          </button>
          <button type="button" className="btn btn-secondary" aria-disabled="true" aria-describedby="period-hint">
            <CalendarDays size={16} aria-hidden="true" />
            {messages.shell.period}
            <ChevronDown size={14} aria-hidden="true" />
          </button>
          <span className="visually-hidden" id="period-hint">
            {messages.shell.periodHint}
          </span>
          <button type="button" className="btn btn-secondary" popoverTarget="notifications" aria-label={messages.shell.notifications}>
            <Bell size={16} aria-hidden="true" />
          </button>
          <div id="notifications" popover="auto" className="popover">
            <p>{messages.shell.noNotifications}</p>
          </div>
          <button type="button" className="avatar" popoverTarget="account-menu" aria-label={`${data.user.initials}, ${messages.shell.account}`}>
            {data.user.initials}
          </button>
          <div id="account-menu" popover="auto" className="popover">
            <p style={{ margin: "8px 10px" }}>
              <strong>{data.user.name}</strong>
              <br />
              <span className="muted">{data.user.email}</span>
            </p>
            <form action={logoutAction}>
              <button type="submit">
                <LogOut size={16} aria-hidden="true" /> {messages.shell.logout}
              </button>
            </form>
          </div>
        </header>
        <main id="content" tabIndex={-1} className="page">
          <PageTransition>{children}</PageTransition>
        </main>
      </div>
      <Drawer open={menuOpen} title={messages.shell.openMenu} onClose={() => setMenuOpen(false)}>
        <WorkspaceSwitcher data={data} initial={initial} menuId="drawer-workspace-menu" />
        <SideNav onNavigate={() => setMenuOpen(false)} />
        <PlanCard open={planNote} onOpen={() => setPlanNote(true)} />
      </Drawer>
    </div>
  );
}

function WorkspaceSwitcher({ data, initial, menuId }: { data: ShellData; initial: string; menuId: string }) {
  return (
    <>
      <button type="button" className="workspace-switch" popoverTarget={menuId}>
        <span className="workspace-mark">{initial}</span>
        <span>
          <strong>{data.workspace.name}</strong>
          <br />
          <small>{messages.shell.workspace}</small>
        </span>
        <ChevronDown size={16} aria-hidden="true" style={{ marginLeft: "auto" }} />
      </button>
      <div id={menuId} popover="auto" className="popover">
        {data.workspaces.map((workspace) => (
          <form key={workspace.id} action={switchWorkspaceAction}>
            <input type="hidden" name="workspaceId" value={workspace.id} />
            <button type="submit">{workspace.name}</button>
          </form>
        ))}
        <Link href="/onboarding">
          <Plus size={16} aria-hidden="true" /> {messages.shell.newWorkspace}
        </Link>
      </div>
    </>
  );
}

function PlanCard({ open, onOpen }: { open: boolean; onOpen: () => void }) {
  return (
    <section className="plan-card">
      <strong>{messages.shell.planTitle}</strong>
      <p>{messages.shell.planBody}</p>
      <button type="button" className="btn" aria-disabled="true" onClick={onOpen}>
        {messages.shell.managePlan}
      </button>
      {open ? <p>{messages.shell.managePlanHint}</p> : null}
    </section>
  );
}
