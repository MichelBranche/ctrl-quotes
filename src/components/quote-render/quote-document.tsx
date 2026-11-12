"use client";

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { photoUrl } from "@/domain/templates";
import type { QuoteSnapshot } from "@/domain/quote-snapshot";
import { cn } from "@/lib/cn";
import type { Kit } from "./kit";
import { IdScopeProvider, SheetProvider, webKit } from "./kit-web";
import { buildModel, type LogoInfo, type Resources } from "./model";
import { renderers } from "./templates";

/**
 * The single HTML renderer of a quote. Editor preview, full preview and (in phase 4) the public page
 * all use it. It runs the same template source as the PDF. Every user value is printed as a text node.
 */
export type QuoteDocumentProps = {
  snapshot: QuoteSnapshot;
  /** URL prefix for uploaded quote images, e.g. "/api/assets/". */
  assetBase?: string;
  logoSrc: string | null;
  watermark?: string | null;
  versionLabel?: string | null;
  /** Highlights the block selected in the editor. */
  activeBlockId?: string | null;
  /** "sheet": A4 pages scaled to fit. "flow": fluid single column. "auto": flow under 768 px. */
  layout?: "sheet" | "flow" | "auto";
  /** Entrance and count-up animations. Off for thumbnails. */
  animate?: boolean;
  /** Only these pages (0-based), e.g. [0] for a cover thumbnail. */
  only?: number[];
  className?: string;
  /** Kit used to print the pages. The visual editor passes the edit kit; everything else the web kit. */
  kit?: Kit;
  /** Fixed scale of the sheets instead of fitting the width (visual editor zoom). */
  zoom?: number;
  /**
   * Editors only: an image block with no photo yet shows this picture instead of nothing,
   * so a block just added is there to see. The PDF never gets it.
   */
  imagePlaceholder?: string;
};

const placeholderAsset = "__editor-placeholder__";

/** Average tone and aspect of the logo, read in the browser so SVG logos work too. */
function useLogo(src: string | null): LogoInfo | null {
  const [info, setInfo] = useState<{ src: string; tone: LogoInfo["tone"]; aspect: number | null } | null>(null);
  useEffect(() => {
    if (!src) return;
    let alive = true;
    const image = new Image();
    image.decoding = "async";
    image.onload = () => {
      if (!alive) return;
      const aspect = image.naturalWidth && image.naturalHeight ? image.naturalWidth / image.naturalHeight : null;
      let tone: LogoInfo["tone"] = null;
      try {
        const canvas = document.createElement("canvas");
        canvas.width = 120;
        canvas.height = Math.max(1, Math.round(120 / (aspect ?? 3)));
        const context = canvas.getContext("2d");
        if (context) {
          context.drawImage(image, 0, 0, canvas.width, canvas.height);
          const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
          let sum = 0;
          let weight = 0;
          for (let index = 0; index < data.length; index += 4) {
            const alpha = (data[index + 3] ?? 0) / 255;
            if (alpha < 0.2) continue;
            sum += (0.2126 * (data[index] ?? 0) + 0.7152 * (data[index + 1] ?? 0) + 0.0722 * (data[index + 2] ?? 0)) * alpha;
            weight += alpha;
          }
          const opaque = weight / (canvas.width * canvas.height);
          tone = opaque > 0.92 || weight === 0 ? null : sum / weight / 255 > 0.6 ? "light" : "dark";
        }
      } catch {
        tone = null;
      }
      setInfo({ src, tone, aspect });
    };
    image.src = src;
    return () => {
      alive = false;
    };
  }, [src]);
  if (!src) return null;
  return info && info.src === src ? info : { src, tone: null, aspect: null };
}

/** Reveals [data-a] elements once, when about 15% visible, including ones mounted later. Reduced motion shows everything at once. */
function useReveal(root: React.RefObject<HTMLDivElement | null>, enabled: boolean, key: string) {
  useEffect(() => {
    const node = root.current;
    if (!node || !enabled || typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    node.classList.add("qd-anim");
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add("is-in");
          observer.unobserve(entry.target);
        }
      },
      { threshold: 0.15 },
    );
    const watch = (scope: Element) => {
      const elements = scope.matches("[data-a]") ? [scope, ...scope.querySelectorAll("[data-a]")] : [...scope.querySelectorAll("[data-a]")];
      for (const element of elements) if (!element.classList.contains("is-in")) observer.observe(element);
    };
    watch(node);
    // Blocks added while editing mount new [data-a] elements: watch them too, or they stay invisible.
    const mutations = new MutationObserver((records) => {
      for (const record of records) for (const added of record.addedNodes) if (added instanceof Element) watch(added);
    });
    mutations.observe(node, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      mutations.disconnect();
    };
  }, [root, enabled, key]);
}

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** Scales A4 sheets to the available width without touching their layout. Null until measured. */
function useFit(root: React.RefObject<HTMLDivElement | null>) {
  const [scale, setScale] = useState<number | null>(null);
  useIsoLayoutEffect(() => {
    const node = root.current;
    if (!node) return;
    const sheetPx = (595.28 * 96) / 72;
    const measure = (width: number) => setScale(Math.min(1.25, width / sheetPx));
    measure(node.getBoundingClientRect().width);
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) measure(entry.contentRect.width);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [root]);
  return scale;
}

export function QuoteDocumentView({
  snapshot,
  assetBase = "/api/assets/",
  logoSrc,
  watermark,
  versionLabel,
  activeBlockId,
  layout = "sheet",
  animate = true,
  only,
  className,
  kit = webKit,
  zoom,
  imagePlaceholder,
}: QuoteDocumentProps) {
  const logo = useLogo(logoSrc);
  const root = useRef<HTMLDivElement>(null);
  const scope = `qd${useId().replace(/[^\w-]/g, "")}`;
  const fit = useFit(root);
  const scale = zoom ?? fit;
  const renderer = renderers[snapshot.template] ?? renderers.minimal;
  const model = useMemo(() => {
    const resources: Resources = {
      logo,
      photo: (key, option, slot) => photoUrl(key, option, slot),
      image: (assetId) => (imagePlaceholder && assetId === placeholderAsset ? imagePlaceholder : `${assetBase}${encodeURIComponent(assetId)}`),
      watermark: watermark ?? null,
      versionLabel: versionLabel ?? (watermark ? "Bozza" : null),
    };
    const source = imagePlaceholder
      ? {
          ...snapshot,
          document: {
            ...snapshot.document,
            blocks: snapshot.document.blocks.map((block) => (block.type === "image" && !block.assetId ? { ...block, assetId: placeholderAsset } : block)),
          },
        }
      : snapshot;
    return buildModel(source, resources, renderer.numbering);
  }, [snapshot, logo, assetBase, watermark, versionLabel, renderer.numbering, imagePlaceholder]);
  const pages = renderer.render(kit, model);
  useReveal(root, animate, `${snapshot.template}:${pages.length}`);
  return (
    <div
      ref={root}
      className={cn("qd qd-stage", className)}
      data-layout={layout}
      data-template={snapshot.template}
      data-active={activeBlockId ?? undefined}
      data-fit={scale === null ? "pending" : undefined}
      style={{ "--qd-fit": scale ?? 1 } as React.CSSProperties}
    >
      {activeBlockId ? <style>{`.qd-stage [data-block-id="${activeBlockId.replace(/[^\w-]/g, "")}"]{outline:2px solid var(--color-accent, #7c3aed);outline-offset:4px;border-radius:2px}`}</style> : null}
      <IdScopeProvider scope={scope}>
        <div className="qd-sheets">
          {pages.map((page, index) =>
            only && !only.includes(index) ? null : (
              <SheetProvider key={index} index={index + 1} total={pages.length}>
                {page}
              </SheetProvider>
            ),
          )}
        </div>
      </IdScopeProvider>
    </div>
  );
}
