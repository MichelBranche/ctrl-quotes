import type { ReactNode } from "react";
import Link from "next/link";
import { AuthBackdrop } from "@/components/auth/auth-backdrop";
import { Logo } from "@/components/logo";

export function AuthScreen({ children }: { children: ReactNode }) {
  return (
    <main className="auth-screen">
      <AuthBackdrop />
      <section className="auth-card">
        <Link href="/login" aria-label="CTRL Quotes">
          <Logo />
        </Link>
        {children}
      </section>
    </main>
  );
}
