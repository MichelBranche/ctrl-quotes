"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { ArrowRight, Bell, LogOut, Menu, PanelLeftClose, PanelLeftOpen, Plus, Search } from "lucide-react";
import { PageTransition } from "@/components/motion/page-transition";
import { SectionTransitionProvider } from "@/components/motion/section-transition";
import { AnchoredPopover } from "@/components/ui/anchored-popover";
import { Drawer } from "@/components/ui/overlays";
import { SideNav } from "@/components/shell/nav";
import { currentPlanLabel, type PlanId } from "@/domain/plans";
import type { ShellData } from "@/components/shell/types";
import { messages } from "@/i18n/it";
import { cn } from "@/lib/cn";
import { logoutAction, switchWorkspaceAction } from "@/server/actions";

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
            <PlanCard plan={data.workspace.plan} override={data.workspace.planOverride} />
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
            <AnchoredPopover
              id="notifications"
              trigger={
                <button type="button" className="tb-icon" aria-label={messages.shell.notifications}>
                  <Bell size={18} aria-hidden="true" />
                </button>
              }
            >
              <p>{messages.shell.noNotifications}</p>
            </AnchoredPopover>
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
              {data.workspaces.map((workspace) => (
                <form key={workspace.id} action={switchWorkspaceAction}>
                  <input type="hidden" name="workspaceId" value={workspace.id} />
                  <button type="submit" aria-current={workspace.id === data.workspace.id ? "true" : undefined}>
                    {workspace.name}
                  </button>
                </form>
              ))}
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
            <PageTransition>{children}</PageTransition>
          </main>
        </div>
        <Drawer open={menuOpen} title={messages.shell.openMenu} onClose={() => setMenuOpen(false)}>
          <SideNav onNavigate={() => setMenuOpen(false)} />
          <div className="sb-foot">
            <PlanCard plan={data.workspace.plan} override={data.workspace.planOverride} />
            <Link className="btn-new" href="/app/quotes/new" onClick={() => setMenuOpen(false)}>
              <Plus size={18} aria-hidden="true" />
              <span>{messages.quotes.action}</span>
            </Link>
          </div>
        </Drawer>
      </div>
    </SectionTransitionProvider>
  );
}

function PlanCard({ plan, override }: { plan: string; override: PlanId | null }) {
  const title = currentPlanLabel(plan, override);
  return (
    <>
      <section className="pro-card brand-fill">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="pro-quote" src="/brand/quote-marks.png" alt="" width={54} height={32} />
        <strong className="pro-title">{title}</strong>
        <p className="pro-text">{messages.shell.planBody}</p>
        <Link className="pro-btn" href="/app/settings/billing">
          {messages.shell.managePlan} <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </section>
      <Link className="pro-mini brand-fill" href="/app/settings/billing" aria-label={title} title={title}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/quote-marks.png" alt="" width={22} height={13} />
      </Link>
    </>
  );
}
