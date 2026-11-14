"use client";

import dynamic from "next/dynamic";
import { tint, useWavesEnv } from "@/components/waves/use-waves-env";

const LineWaves = dynamic(() => import("@/components/auth/line-waves"), { ssr: false, loading: () => null });

/** Full-page animated line waves behind the auth card, in a soft brand tone. Falls back to the plain light page without WebGL2 or with reduced motion. */
export function AuthWaves() {
  const env = useWavesEnv();
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
