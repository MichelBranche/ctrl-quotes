"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CreditCard, FileText, Hash, Palette, Percent, Settings, Users } from "lucide-react";
import { messages } from "@/i18n/it";

const groups = [
  {
    title: "Generale",
    links: [
      { href: "/app/settings/profile", label: messages.settings.profile, icon: Settings },
      { href: "/app/settings/brand", label: messages.settings.brand, icon: Palette },
      { href: "/app/settings/fiscal", label: "Fiscale e IVA", icon: Percent },
      { href: "/app/settings/numbering", label: messages.settings.numbering, icon: Hash },
      { href: "/app/settings/terms", label: messages.settings.terms, icon: FileText },
    ],
  },
  {
    title: "Gestione",
    links: [
      { href: "/app/settings/team", label: "Team e ruoli", icon: Users },
      { href: "/app/settings/billing", label: messages.settings.billing, icon: CreditCard },
    ],
  },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // Abbonamento has its own full-width layout with in-page pills (see billing/layout.tsx).
  // The settings home (card grid) is full width too.
  if (pathname === "/app/settings" || pathname.startsWith("/app/settings/billing")) return <>{children}</>;
  return (
    <div className="settings-layout">
      <nav className="card settings-nav" aria-label={messages.settings.nav}>
        {groups.map((group) => (
          <div key={group.title} className="settings-group">
            <span className="settings-group-title">{group.title}</span>
            {group.links.map((link) => {
              const Icon = link.icon;
              return (
                <Link key={link.href} href={link.href} className="nav-link" aria-current={pathname === link.href ? "page" : undefined}>
                  <Icon size={16} aria-hidden="true" />
                  {link.label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
      <div className="settings-content">{children}</div>
    </div>
  );
}
