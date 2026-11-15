"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useWavesEnv } from "@/components/waves/use-waves-env";

const MoltenMetal = dynamic(() => import("@/components/billing/effects/molten-metal"), { ssr: false, loading: () => null });

/*
 * Giant footer wordmark. The letters are a knockout in an SVG mask (textLength keeps every glyph inside the viewBox at
 * any width), and the Business plan's MoltenMetal liquid shows through them. With reduced motion or without WebGL2 the
 * same letters show a static lime gradient instead. The WebGL effect mounts only once the footer is near the viewport.
 */
export function FooterWordmark() {
  const env = useWavesEnv();
  const ref = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node || !env.ok) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setNear(true);
        io.disconnect();
      }
    }, { rootMargin: "300px 0px" });
    io.observe(node);
    return () => io.disconnect();
  }, [env.ok]);

  return (
    <div ref={ref} className="lp-footer-word" aria-hidden="true">
      <div className="lp-footer-word-fill">
        {env.ok && near ? (
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
            dpr={1.5}
          />
        ) : null}
      </div>
      <svg className="lp-footer-word-mask" viewBox="0 0 1000 156" preserveAspectRatio="none">
        <defs>
          <mask id="lp-footer-knockout" maskUnits="userSpaceOnUse" x="0" y="0" width="1000" height="156">
            <rect width="1000" height="156" fill="#fff" />
            <text x="500" y="140" textAnchor="middle" textLength="972" lengthAdjust="spacingAndGlyphs" fill="#000">
              CTRL® QUOTES
            </text>
          </mask>
        </defs>
        <rect width="1000" height="156" mask="url(#lp-footer-knockout)" />
      </svg>
    </div>
  );
}
