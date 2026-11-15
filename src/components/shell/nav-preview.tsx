"use client";

import { useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, CircleHelp, FileText, House, Layers, LayoutGrid, PanelLeftClose, PanelLeftOpen, Settings, Users } from "lucide-react";
import { NavIndicator } from "@/components/shell/nav";
import { messages } from "@/i18n/it";
import { cn } from "@/lib/cn";

const prefix = "/dev/nav-indicator";

const items = [
  { href: `${prefix}/overview`, label: messages.shell.overview, icon: House },
  { href: `${prefix}/quotes`, label: messages.shell.quotes, icon: FileText },
  { href: `${prefix}/clients`, label: messages.shell.clients, icon: Users },
  { href: `${prefix}/catalog`, label: messages.shell.catalog, icon: Layers },
  { href: `${prefix}/workspace`, label: messages.shell.workspace, icon: Building2 },
  { href: `${prefix}/templates`, label: messages.shell.templates, icon: LayoutGrid },
] as const;

const secondary = [
  { href: `${prefix}/settings`, label: messages.shell.settings, icon: Settings },
  { href: `${prefix}/help`, label: messages.shell.help, icon: CircleHelp },
] as const;

const all = [...items, ...secondary];

function isCurrent(pathname: string, href: string): boolean {
  if (href.endsWith("/overview")) return pathname === href || pathname === prefix || pathname === `${prefix}/`;
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Same sidebar chrome and indicator as the app, without auth, for local visual QA. */
export function NavIndicatorPreview({ children }: { children?: React.ReactNode }) {
  const pathname = usePathname();
  const [compact, setCompact] = useState(false);
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const path = pendingHref ?? pathname;
  const activeHref = all.find((item) => isCurrent(path, item.href))?.href;
  const section = all.find((item) => isCurrent(pathname, item.href))?.label ?? messages.shell.overview;

  useLayoutEffect(() => {
    if (pendingHref && isCurrent(pathname, pendingHref)) setPendingHref(null);
  }, [pathname, pendingHref]);

  const list = (group: typeof items | typeof secondary) => (
    <ul className="nav-list">
      {group.map((item) => {
        const Icon = item.icon;
        const current = isCurrent(path, item.href);
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              data-nav={item.href}
              className="nav-link"
              aria-current={current ? "page" : undefined}
              onClick={() => setPendingHref(item.href)}
              title={compact ? item.label : undefined}
            >
              <Icon size={20} strokeWidth={1.75} aria-hidden="true" />
              <span>{item.label}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );

  return (
    <div className={cn("shell", compact && "is-collapsed")} data-nav-preview="" style={{ display: "flex" }}>
      <aside className="sidebar sidebar-desktop">
        <div className="sb-brand">
          <span className="sb-logo" style={{ fontWeight: 700 }}>
            CTRL
          </span>
          <button
            type="button"
            className="sb-toggle"
            data-collapse-toggle=""
            onClick={() => setCompact((value) => !value)}
            aria-label={compact ? "Espandi la barra laterale" : "Riduci la barra laterale"}
            aria-pressed={compact}
          >
            {compact ? <PanelLeftOpen size={16} aria-hidden="true" /> : <PanelLeftClose size={16} aria-hidden="true" />}
          </button>
        </div>
        <div className="side-nav" ref={rootRef}>
          <NavIndicator rootRef={rootRef} activeHref={activeHref} compact={compact} />
          <nav aria-label={messages.shell.primaryNav}>{list(items)}</nav>
          <hr className="nav-rule" />
          <nav aria-label={messages.shell.secondaryNav}>{list(secondary)}</nav>
        </div>
      </aside>
      <div className="main-col">
        <main className="page" style={{ padding: 24 }}>
          {children ?? <h1 style={{ margin: 0, fontSize: 24 }}>{section}</h1>}
        </main>
      </div>
    </div>
  );
}
