import type { ReactNode } from "react";
import Link from "next/link";
import { AuthWaves } from "@/components/auth/auth-waves";
import { messages } from "@/i18n/it";

/** Split auth card: line waves behind the whole page, saturated brand panel on the left, white form panel on the right. */
export function AuthScreen({ children }: { children: ReactNode }) {
  return (
    <main className="auth-screen">
      <AuthWaves />
      <div className="auth-split">
        <aside className="auth-brand">
          <Link href="/login" className="auth-mark" aria-label={messages.brand}>
            <span className="auth-mark-tile">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/icon-compact.png" alt="" width={48} height={48} />
            </span>
            <span className="auth-mark-word">CTRL® Quotes</span>
          </Link>
          <p className="auth-brand-line">Preventivi chiari, inviati in pochi minuti.</p>
        </aside>
        <section className="auth-card">{children}</section>
      </div>
    </main>
  );
}
