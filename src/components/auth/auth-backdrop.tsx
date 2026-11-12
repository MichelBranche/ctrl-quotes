"use client";

import { useEffect, useRef } from "react";

const FULL_WIDTHS = [1280, 1920, 2560, 3840] as const;
const SIDE_WIDTHS = [800, 1280] as const;
const TRANSPARENT = "data:image/gif;base64,R0lGODlhAQABAAAAACwAAAAAAQABAAA=";

function srcSet(kind: "scene" | "left" | "right", widths: readonly number[], ext: "avif" | "webp"): string {
  return widths.map((width) => `/auth/${kind}-${width}.${ext} ${width}w`).join(", ");
}

export function AuthBackdrop() {
  const layerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const fine = window.matchMedia("(pointer: fine)").matches;
    if (reduced || !fine) return;

    const onMove = (event: PointerEvent) => {
      const x = (event.clientX / window.innerWidth - 0.5) * 10;
      const y = (event.clientY / window.innerHeight - 0.5) * 6;
      layer.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0)`;
    };
    const reset = () => {
      layer.style.transform = "translate3d(0, 0, 0)";
    };
    window.addEventListener("pointermove", onMove);
    document.addEventListener("mouseleave", reset);
    return () => {
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("mouseleave", reset);
    };
  }, []);

  return (
    <div className="auth-backdrop" aria-hidden="true">
      <div className="auth-backdrop-parallax" ref={layerRef}>
        <div className="auth-backdrop-blur" />
        <picture className="auth-backdrop-full">
          <source media="(min-width: 1280px)" type="image/avif" srcSet={srcSet("scene", FULL_WIDTHS, "avif")} sizes="100vw" />
          <source media="(min-width: 1280px)" type="image/webp" srcSet={srcSet("scene", FULL_WIDTHS, "webp")} sizes="100vw" />
          <img src={TRANSPARENT} alt="" width={1920} height={1033} decoding="async" />
        </picture>
        <div className="auth-backdrop-split">
          <picture className="auth-backdrop-left">
            <source media="(min-width: 768px) and (max-width: 1279px)" type="image/avif" srcSet={srcSet("left", SIDE_WIDTHS, "avif")} sizes="26vw" />
            <source media="(min-width: 768px) and (max-width: 1279px)" type="image/webp" srcSet={srcSet("left", SIDE_WIDTHS, "webp")} sizes="26vw" />
            <img src={TRANSPARENT} alt="" width={800} height={1157} decoding="async" />
          </picture>
          <picture className="auth-backdrop-right">
            <source media="(min-width: 768px) and (max-width: 1279px)" type="image/avif" srcSet={srcSet("right", SIDE_WIDTHS, "avif")} sizes="26vw" />
            <source media="(min-width: 768px) and (max-width: 1279px)" type="image/webp" srcSet={srcSet("right", SIDE_WIDTHS, "webp")} sizes="26vw" />
            <img src={TRANSPARENT} alt="" width={800} height={951} decoding="async" />
          </picture>
        </div>
      </div>
    </div>
  );
}
