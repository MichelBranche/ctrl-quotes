"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, CircleHelp, FileText, House, Layers, LayoutGrid, Settings, Users } from "lucide-react";
import { messages } from "@/i18n/it";

const primary = [
  { href: "/app/overview", label: messages.shell.overview, icon: House },
  { href: "/app/quotes", label: messages.shell.quotes, icon: FileText },
  { href: "/app/clients", label: messages.shell.clients, icon: Users },
  { href: "/app/catalog", label: messages.shell.catalog, icon: Layers },
  { href: "/app/workspace", label: messages.shell.workspace, icon: Building2 },
  { href: "/app/templates", label: messages.shell.templates, icon: LayoutGrid },
] as const;

const secondary = [
  { href: "/app/settings", label: messages.shell.settings, icon: Settings },
  { href: "/app/help", label: messages.shell.help, icon: CircleHelp },
] as const;

function isCurrent(pathname: string, href: string): boolean {
  return pathname === href || (href !== "/app/overview" && pathname.startsWith(href));
}

export function SideNav({ onNavigate, compact = false }: { onNavigate?: () => void; compact?: boolean }) {
  const pathname = usePathname();
  const list = (items: typeof primary | typeof secondary) => (
    <ul className="nav-list">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              className="nav-link"
              aria-current={isCurrent(pathname, item.href) ? "page" : undefined}
              onClick={onNavigate}
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
    <>
      <nav aria-label={messages.shell.primaryNav}>{list(primary)}</nav>
      <hr className="nav-rule" />
      <nav aria-label={messages.shell.secondaryNav}>{list(secondary)}</nav>
    </>
  );
}
