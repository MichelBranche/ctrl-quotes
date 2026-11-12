import type { ReactNode } from "react";
import Link from "next/link";
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

function AuthBackdrop() {
  return (
    <svg aria-hidden="true" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
      <rect width="1440" height="900" fill="var(--cq-auth-bg)" />
      <path d="M-40 620C180 520 280 860 520 760C760 660 820 420 1100 500C1320 560 1400 760 1520 700L1520 980L-40 980Z" fill="var(--cq-auth-sand)" />
      <path d="M900 -40C1040 80 980 240 1120 300C1280 370 1360 220 1520 260L1520 -40Z" fill="var(--cq-auth-mist)" />
      <path d="M-80 180C120 80 180 260 360 210C560 150 620 20 860 90C1040 140 980 280 760 340C520 410 220 320 -80 420Z" fill="var(--cq-auth-paper)" opacity="0.9" />
    </svg>
  );
}
