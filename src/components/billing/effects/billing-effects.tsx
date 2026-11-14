"use client";

import { useEffect } from "react";
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
const GradientBlinds = dynamic(() => import("@/components/billing/effects/gradient-blinds"), { ssr: false, loading: () => null });

/** Background of the dark hero on /starter, /pro and /business. The 3D artwork stays on top of it. */
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
          lineCount={env.mobile ? 22 : 34}
          lineWidth={1.2}
          highlight={0.8}
          warpIntensity={1}
          rotation={-28}
          enableMouseInteraction
          colorCycleSpeed={0.6}
          glow={0.7}
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
          brightness={1.6}
          contrast={1.25}
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
          brightness={1.1}
          contrast={1.1}
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
          opacity={0.7}
          resolution={0.75}
        />
      )}
    </div>
  );
}

/**
 * Light gradient blinds behind the whole window on "Scegli il piano", sidebar and topbar included.
 * While it is mounted, <html data-bl-backdrop> lets the shell go transparent around its cards (billing.css). The
 * attribute is removed on unmount and when Next hides this route in the background (effects are cleaned up then),
 * so the normal layout comes back intact on every other page.
 */
export function PlansBackdrop() {
  const env = useWavesEnv();
  if (!env.ok) return null;
  return <BlindsLayer brand={env.brand} mobile={env.mobile} />;
}

function BlindsLayer({ brand, mobile }: { brand: string; mobile: boolean }) {
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-bl-backdrop", "");
    return () => root.removeAttribute("data-bl-backdrop");
  }, []);
  return (
    <div className="bl-backdrop" aria-hidden="true">
      <GradientBlinds
        gradientColors={[tint(brand, 0.38), tint(brand, 0.14), tint(brand, 0.55), tint(brand, 0.2)]}
        angle={20}
        noise={0.08}
        blindCount={mobile ? 8 : 18}
        blindMinWidth={60}
        spotlightRadius={0.5}
        spotlightSoftness={1}
        spotlightOpacity={0.6}
        mouseDampening={0.15}
        distortAmount={0}
        shineDirection="left"
        clickEffect="ripple"
        intro
        lightMode
        dpr={1}
      />
    </div>
  );
}
