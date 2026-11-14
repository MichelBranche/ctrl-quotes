import Link from "next/link";
import { cn } from "@/lib/cn";

const items = [
  { href: "/privacy", label: "Privacy" },
  { href: "/termini", label: "Termini" },
  { href: "/privacy#cookie", label: "Cookie" },
] as const;

export function LegalLinks({ className, "aria-label": ariaLabel = "Informazioni legali" }: { className?: string; "aria-label"?: string }) {
  return (
    <nav className={cn("legal-links", className)} aria-label={ariaLabel}>
      {items.map((item, index) => (
        <span key={item.href}>
          {index > 0 ? <span aria-hidden="true"> · </span> : null}
          <Link href={item.href}>{item.label}</Link>
        </span>
      ))}
    </nav>
  );
}
