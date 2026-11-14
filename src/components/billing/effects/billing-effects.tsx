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
        <Iridescence
          color={[1, 1, 1]}
          saturation={0}
          brightness={1.55}
          contrast={1.5}
          speed={0.45}
          scale={1.2}
          detail={7}
          warp={1}
          mouseReact
          amplitude={0.08}
          stir={0.45}
          sheen={0.3}
          clickSwirl
          fade={0}
          opacity={0.9}
          resolution={0.75}
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
