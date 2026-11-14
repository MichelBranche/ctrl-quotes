"use client";

import dynamic from "next/dynamic";
import { useWavesEnv } from "@/components/waves/use-waves-env";

const LineWaves = dynamic(() => import("@/components/auth/line-waves"), { ssr: false, loading: () => null });

/**
 * White line waves on the saturated brand card "I tuoi template". Fewer lines than the login, and
 * LineWaves itself stops drawing while the card is off screen (IntersectionObserver) or the tab is hidden.
 * Without WebGL2 or with reduced motion nothing renders and the card keeps its CSS brand gradient.
 */
export function TemplateWaves() {
  const env = useWavesEnv();
  if (!env.ok) return null;
  return (
    <div className="ov-templates-waves" aria-hidden="true">
      <LineWaves
        color1={env.brand}
        color2="#ffffff"
        color3="#ffffff"
        speed={0.3}
        lineCount={env.mobile ? 24 : 40}
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
        clickRipple={false}
        intro
        lightMode={false}
        opacity={0.9}
        maxDevicePixelRatio={1.5}
      />
    </div>
  );
}
