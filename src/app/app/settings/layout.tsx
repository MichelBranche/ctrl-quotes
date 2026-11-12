"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { messages } from "@/i18n/it";

const links = [
  { href: "/app/settings", label: messages.settings.profile },
  { href: "/app/settings/brand", label: messages.settings.brand },
  { href: "/app/settings/numbering", label: messages.settings.numbering },
  { href: "/app/settings/terms", label: messages.settings.terms },
  { href: "/app/settings/billing", label: messages.settings.billing },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="settings-layout">
      <nav className="card settings-nav" aria-label={messages.settings.nav} style={{ padding: 8, alignSelf: "start" }}>
        {links.map((link) => {
          const current = pathname === link.href;
          return (
            <Link key={link.href} href={link.href} className="nav-link" aria-current={current ? "page" : undefined}>
              {link.label}
            </Link>
          );
        })}
      </nav>
      <div>{children}</div>
    </div>
  );
}
