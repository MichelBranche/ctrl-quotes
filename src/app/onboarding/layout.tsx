import type { ReactNode } from "react";
import { Suspense } from "react";

export default function OnboardingLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<div className="auth-screen" aria-busy="true" />}>
      {children}
    </Suspense>
  );
}
