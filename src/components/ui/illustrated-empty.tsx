import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

const scenes = {
  "first-quote": {
    widths: [640, 960, 1280, 1493],
    width: 1493,
    height: 922,
  },
  "select-client": {
    widths: [640, 960, 1280, 1664],
    width: 1664,
    height: 854,
  },
} as const;

export type EmptyScene = keyof typeof scenes;

export function IllustratedEmpty({
  scene,
  title,
  body,
  action,
  float = false,
  compact = false,
}: {
  scene: EmptyScene;
  title: string;
  body: string;
  action?: ReactNode;
  float?: boolean;
  compact?: boolean;
}) {
  const meta = scenes[scene];
  const avif = meta.widths.map((width) => `/illustrations/${scene}-${width}.avif ${width}w`).join(", ");
  const webp = meta.widths.map((width) => `/illustrations/${scene}-${width}.webp ${width}w`).join(", ");
  return (
    <section className={cn("card empty empty-illustrated", compact && "is-compact")}>
      <div className={cn("empty-illustration", float && "is-float")}>
        <picture>
          <source type="image/avif" srcSet={avif} sizes={compact ? "min(100%, 420px)" : "min(100%, 520px)"} />
          <source type="image/webp" srcSet={webp} sizes={compact ? "min(100%, 420px)" : "min(100%, 520px)"} />
          <img
            src={`/illustrations/${scene}-960.webp`}
            alt=""
            width={meta.width}
            height={meta.height}
            decoding="async"
          />
        </picture>
      </div>
      <h2>{title}</h2>
      <p>{body}</p>
      {action ? <div className="empty-action">{action}</div> : null}
    </section>
  );
}
