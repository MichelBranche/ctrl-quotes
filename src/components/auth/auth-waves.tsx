"use client";

import { useSyncExternalStore } from "react";
import dynamic from "next/dynamic";

const LineWaves = dynamic(() => import("@/components/auth/line-waves"), { ssr: false, loading: () => null });

type Env = { ok: boolean; mobile: boolean; brand: string };
const SERVER: Env = { ok: false, mobile: false, brand: "" };
let cached: Env | null = null;
let cachedKey = "";

function read(): Env {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const mobile = window.matchMedia("(max-width: 767px)").matches;
  const brand = getComputedStyle(document.documentElement).getPropertyValue("--brand").trim() || "#7c3aed";
  const key = `${reduced}|${mobile}|${brand}`;
  if (cached && key === cachedKey) return cached;
  cachedKey = key;
  cached = { ok: !reduced && supportsWebGL2(), mobile, brand };
  return cached;
}

let webgl2: boolean | null = null;
function supportsWebGL2(): boolean {
  if (webgl2 === null) {
    try {
      webgl2 = Boolean(document.createElement("canvas").getContext("webgl2"));
    } catch {
      webgl2 = false;
    }
  }
  return webgl2;
}

function subscribe(listener: () => void) {
  const queries = [window.matchMedia("(prefers-reduced-motion: reduce)"), window.matchMedia("(max-width: 767px)")];
  queries.forEach((query) => query.addEventListener("change", listener));
  return () => queries.forEach((query) => query.removeEventListener("change", listener));
}

/** Mixes a hex color with white: amount is the share of the color (0..1). Same idea as CSS color-mix. */
function tint(hex: string, amount: number): string {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!match) return hex;
  const value = Number.parseInt(match[1], 16);
  const channel = (shift: number) => Math.round(((value >> shift) & 255) * amount + 255 * (1 - amount));
  return `#${[16, 8, 0].map((shift) => channel(shift).toString(16).padStart(2, "0")).join("")}`;
}

/** Full-page animated line waves behind the auth card, in a soft brand tone. Falls back to the plain light page without WebGL2 or with reduced motion. */
export function AuthWaves() {
  const env = useSyncExternalStore(subscribe, read, () => SERVER);
  if (!env.ok) return null;
  return (
    <div className="auth-waves" aria-hidden="true">
      <LineWaves
        color1={tint(env.brand, 0.55)}
        color2={tint(env.brand, 0.3)}
        color3={tint(env.brand, 0.75)}
        speed={0.3}
        lineCount={env.mobile ? 40 : 72}
        lineWidth={1.3}
        highlight={1}
        warpIntensity={1}
        rotation={-33}
        enableMouseInteraction
        colorCycleSpeed={1}
        glow={0.6}
        brightness={1}
        highlightWidth={1}
        warpScale={1}
        edgeFade={0}
        mouseInfluence={2}
        clickRipple
        intro
        lightMode
        opacity={0.45}
      />
    </div>
  );
}
