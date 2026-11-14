"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { tint, useWavesEnv } from "@/components/waves/use-waves-env";

const LineWaves = dynamic(() => import("@/components/auth/line-waves"), { ssr: false, loading: () => null });

const ENTRANCE_MS = 750;

/**
 * The login's line waves (same props as AuthWaves) behind "Seleziona un elemento". Client only and lazy; LineWaves stops
 * drawing off screen or with the tab hidden. WebGL setup waits for the cards' entrance. With reduced motion or without
 * WebGL2 nothing renders and the panel keeps its CSS gradient. Unmounted when an item is selected.
 */
export function CatalogEmptyWaves() {
  const env = useWavesEnv();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const id = window.setTimeout(() => setReady(true), ENTRANCE_MS);
    return () => window.clearTimeout(id);
  }, []);
  if (!env.ok || !ready) return null;
  return (
    <div className="ct-empty-waves" aria-hidden="true">
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
