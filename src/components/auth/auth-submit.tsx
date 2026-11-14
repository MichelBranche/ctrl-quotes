"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import StarBorder from "@/components/ui/star-border";

const FALLBACK = "#7c3aed";
const noop = () => () => {};
const readBrand = () => getComputedStyle(document.documentElement).getPropertyValue("--brand").trim() || FALLBACK;

/** Primary submit of the auth forms: anthracite pill with a brand star running on the border (React Bits StarBorder). */
export function AuthSubmit({ loading = false, disabled = false, children }: { loading?: boolean; disabled?: boolean; children: ReactNode }) {
  const brand = useSyncExternalStore(noop, readBrand, () => FALLBACK);
  return (
    <StarBorder
      as="button"
      type="submit"
      className="auth-cta"
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      color={brand}
      trailColor={brand}
      duration={4}
      direction="clockwise"
      stars={1}
      trailLength={0.3}
      thickness={1}
      radius={24}
      glow={0.6}
      hover="lap"
      clickPulse
      sparkle={false}
      theme="dark"
      backgroundColor="var(--cq-ink)"
      textColor="white"
    >
      {loading ? <span className="spinner" aria-hidden="true" /> : null}
      {children}
    </StarBorder>
  );
}
