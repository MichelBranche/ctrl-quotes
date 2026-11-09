"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Boxes, CircleHelp, CreditCard, FileText, House, LayoutTemplate, Settings, Users } from "lucide-react";
import { messages } from "@/i18n/it";

const primary = [
  { href: "/app/overview", label: messages.shell.overview, icon: House },
  { href: "/app/quotes", label: messages.shell.quotes, icon: FileText },
  { href: "/app/clients", label: messages.shell.clients, icon: Users },
  { href: "/app/catalog", label: messages.shell.catalog, icon: Boxes },
  { href: "/app/templates", label: messages.shell.templates, icon: LayoutTemplate },
] as const;

const secondary = [
  { href: "/app/settings", label: messages.shell.settings, icon: Settings },
  { href: "/app/help", label: messages.shell.help, icon: CircleHelp },
] as const;

function isCurrent(pathname: string, href: string): boolean {
  return pathname === href || (href !== "/app/overview" && pathname.startsWith(href));
}

export function SideNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const [billingNote, setBillingNote] = useState(false);
  return (
    <>
      <nav aria-label={messages.shell.primaryNav}>
        <ul className="nav-list">
          {primary.map((item) => {
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="nav-link"
                  aria-current={isCurrent(pathname, item.href) ? "page" : undefined}
                  onClick={onNavigate}
                >
                  <Icon size={18} aria-hidden="true" />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <nav aria-label={messages.shell.secondaryNav}>
        <ul className="nav-list">
          {secondary.map((item) => {
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="nav-link"
                  aria-current={isCurrent(pathname, item.href) ? "page" : undefined}
                  onClick={onNavigate}
                >
                  <Icon size={18} aria-hidden="true" />
                  {item.label}
                </Link>
              </li>
            );
          })}
          <li>
            <button
              type="button"
              className="nav-future"
              aria-disabled="true"
              onClick={() => setBillingNote(true)}
            >
              <CreditCard size={18} aria-hidden="true" />
              {messages.shell.billing}
            </button>
            {billingNote ? <p className="nav-note">{messages.shell.billingHint}</p> : null}
          </li>
        </ul>
      </nav>
    </>
  );
}
