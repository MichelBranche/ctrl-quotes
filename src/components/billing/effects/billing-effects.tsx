"use client";

import dynamic from "next/dynamic";
import { useWavesEnv, tint } from "@/components/waves/use-waves-env";
import type { PlanId } from "@/domain/plans";

/*
 * Animated backgrounds for Abbonamento only. Each one loads lazily on the client and renders nothing with reduced
 * motion or without WebGL2, so the page keeps its static CSS background. The WebGL components stop drawing while
 * off screen (IntersectionObserver); Next keeps visited routes hidden with display:none, which counts as off screen.
 */

const LineWaves = dynamic(() => import("@/components/auth/line-waves"), { ssr: false, loading: () => null });
const MoltenMetal = dynamic(() => import("@/components/billing/effects/molten-metal"), { ssr: false, loading: () => null });
const Iridescence = dynamic(() => import("@/components/billing/effects/iridescence"), { ssr: false, loading: () => null });

/** Fills the dark hero on /starter, /pro and /business (no 3D artwork there). Fallback: the CSS gradient of .bl-hero.is-<plan>. */
export function PlanHeroEffect({ plan }: { plan: PlanId }) {
  const env = useWavesEnv();
  if (!env.ok) return null;
  return (
    <div className={`bl-hero-fx is-${plan}`} aria-hidden="true">
      {plan === "pro" ? (
        <LineWaves
          color1={env.brand}
          color2={tint(env.brand, 0.55)}
          color3={tint(env.brand, 0.8)}
          speed={0.28}
          lineCount={env.mobile ? 26 : 42}
          lineWidth={1.2}
          highlight={0.8}
          warpIntensity={1}
          rotation={-28}
          enableMouseInteraction
          colorCycleSpeed={0.6}
          glow={0.9}
          brightness={1.2}
          highlightWidth={1}
          warpScale={1}
          edgeFade={0.1}
          mouseInfluence={1.6}
          clickRipple
          intro
          lightMode={false}
          opacity={1}
          maxDevicePixelRatio={1.5}
        />
      ) : plan === "business" ? (
        <MoltenMetal
          colors={["#456a17", "#91ff00"]}
          coreColor="#fffffe"
          speed={0.87}
          scale={7}
          detail={5.2}
          glow={2.2}
          thickness={1.23}
          haze={0.75}
          mouseInteraction
          flareOnClick
          turbulence={0.13}
          brightness={1.75}
          rotation={115}
          drift={0.52}
        />
      ) : (
        <Iridescence
          color={[1, 1, 1]}
          saturation={0}
          brightness={0.6}
          contrast={1.3}
          speed={0.18}
          scale={1.5}
          detail={6}
          warp={0.8}
          mouseReact
          amplitude={0.05}
          stir={0.25}
          sheen={0.2}
          clickSwirl={false}
          fade={0}
          opacity={0.95}
          resolution={0.75}
        />
      )}
    </div>
  );
}
