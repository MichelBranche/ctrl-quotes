"use client";

import { useSyncExternalStore } from "react";

export type WavesEnv = { ok: boolean; mobile: boolean; brand: string };
const SERVER: WavesEnv = { ok: false, mobile: false, brand: "" };
let cached: WavesEnv | null = null;
let cachedKey = "";

function read(): WavesEnv {
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

/** Whether animated waves can run here (WebGL2, no reduced motion), screen size and the current --brand. */
export function useWavesEnv(): WavesEnv {
  return useSyncExternalStore(subscribe, read, () => SERVER);
}

/** Mixes a hex color with white: amount is the share of the color (0..1). Same idea as CSS color-mix. */
export function tint(hex: string, amount: number): string {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!match) return hex;
  const value = Number.parseInt(match[1], 16);
  const channel = (shift: number) => Math.round(((value >> shift) & 255) * amount + 255 * (1 - amount));
  return `#${[16, 8, 0].map((shift) => channel(shift).toString(16).padStart(2, "0")).join("")}`;
}

