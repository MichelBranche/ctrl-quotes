"use client";

import { createContext, useContext, useEffect, useRef, useState, type ComponentProps, type CSSProperties, type ReactNode } from "react";
import { flatten, type AmountProps, type FigureProps, type ImageProps, type Kit, type Motion, type PageProps, type ShapeProps, type Style, type SvgProps, type TextProps, type ViewProps } from "./kit";

/**
 * DOM implementation of the template kit. Boxes reproduce the react-pdf (Yoga) model:
 * flex column, border-box, lengths in pt. The sheet is exactly A4 wide, so the web preview
 * and the PDF share line breaks; narrow screens switch to a fluid single column through CSS.
 */

const unitless = new Set(["flex", "flexGrow", "flexShrink", "opacity", "zIndex", "fontWeight", "lineHeight", "order"]);
const families: Record<string, string> = {
  CQInter: '"CQ Inter", Inter, ui-sans-serif, system-ui, sans-serif',
  CQCormorant: '"CQ Cormorant", "Cormorant Garamond", Georgia, serif',
  CQFigures: '"CQ Figures", "Instrument Serif", Georgia, serif',
  CQArchivo: '"CQ Archivo", "Archivo Black", "CQ Inter", sans-serif',
};

export function toCss(input: Style): CSSProperties {
  const out: Record<string, string | number> = {};
  for (const [key, raw] of Object.entries(input)) {
    if (raw === undefined) continue;
    const value = typeof raw === "number" && !unitless.has(key) ? `${raw}pt` : raw;
    switch (key) {
      case "paddingHorizontal":
        out.paddingLeft = value;
        out.paddingRight = value;
        break;
      case "paddingVertical":
        out.paddingTop = value;
        out.paddingBottom = value;
        break;
      case "marginHorizontal":
        out.marginLeft = value;
        out.marginRight = value;
        break;
      case "marginVertical":
        out.marginTop = value;
        out.marginBottom = value;
        break;
      case "fontFamily":
        out.fontFamily = families[String(raw)] ?? String(raw);
        break;
      default:
        out[key] = value;
    }
  }
  return out as CSSProperties;
}

function motionAttrs(motion: Motion): Record<string, string | undefined> {
  return {
    "data-a": motion.a,
    "data-hover": motion.hover,
  };
}

function motionStyle(motion: Motion): CSSProperties {
  return motion.i !== undefined ? ({ "--i": motion.i } as CSSProperties) : {};
}

const InText = createContext(false);
const Sheet = createContext({ index: 1, total: 1 });

/** Data attributes the edit kit adds to anchored elements. Empty for the plain web kit. */
export type AnchorAttrs = Record<`data-${string}`, string>;

export function WebV({ style, children, a, i, hover, stack, scrollX, flowStart, blockId, anchor }: ViewProps & { anchor?: AnchorAttrs }) {
  return (
    <div
      className="k-v"
      style={{ ...toCss(flatten(style)), ...motionStyle({ i }) }}
      {...motionAttrs({ a, hover })}
      data-stack={stack ? "" : undefined}
      data-scroll-x={scrollX ? "" : undefined}
      data-flow-start={flowStart ? "" : undefined}
      data-block-id={blockId}
      {...anchor}
    >
      {children}
    </div>
  );
}

export function WebT({ style, children, a, i, decorative, anchor }: TextProps & { anchor?: AnchorAttrs }) {
  const nested = useContext(InText);
  const flat = flatten(style);
  // Display sizes get a cap on phones (see quote-doc.css), so big headings never split words.
  const big = typeof flat.fontSize === "number" && flat.fontSize >= 24;
  const css = { ...toCss(flat), ...motionStyle({ i }), ...(big ? { "--fs": `${flat.fontSize}pt` } : {}) } as CSSProperties;
  const props = { style: css, ...motionAttrs({ a }), "aria-hidden": decorative || undefined, "data-big": big ? "" : undefined, ...anchor };
  return <InText.Provider value={true}>{nested ? <span className="k-ts" {...props}>{children}</span> : <div className="k-t" {...props}>{children}</div>}</InText.Provider>;
}

function Img({ src, style, alt, a, i }: ImageProps) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img className="k-img" src={src} alt={alt ?? ""} style={{ ...toCss(style ?? {}), ...motionStyle({ i }) }} data-a={a} loading="lazy" decoding="async" />;
}

function Svg({ width, height, viewBox, style, children, a, i, preserveAspectRatio }: SvgProps) {
  return (
    <svg
      className="k-svg"
      width={`${width}pt`}
      height={`${height}pt`}
      viewBox={viewBox}
      preserveAspectRatio={preserveAspectRatio}
      style={{ ...toCss(style ?? {}), ...motionStyle({ i }) }}
      aria-hidden="true"
      focusable="false"
      {...motionAttrs({ a })}
    >
      {children}
    </svg>
  );
}

/** SVG ids are document-global: every rendered quote (preview, thumbnails) gets its own prefix. */
const IdScope = createContext("qd");

export function IdScopeProvider({ scope, children }: { scope: string; children: ReactNode }) {
  return <IdScope.Provider value={scope}>{children}</IdScope.Provider>;
}

function scopeUrl(value: string | undefined, scope: string) {
  return value?.startsWith("url(#") ? `url(#${scope}-${value.slice(5)}` : value;
}

const shape = (tag: "path" | "circle" | "rect" | "line" | "ellipse" | "g") =>
  function Shape({ children, ...props }: ShapeProps) {
    const scope = useContext(IdScope);
    const Tag = tag;
    const paint = props as { fill?: string; stroke?: string };
    return (
      <Tag {...props} fill={scopeUrl(paint.fill, scope)} stroke={scopeUrl(paint.stroke, scope)}>
        {children}
      </Tag>
    );
  };

function LinearGradient({ children, id, ...props }: ComponentProps<Kit["LinearGradient"]>) {
  const scope = useContext(IdScope);
  return <linearGradient {...props} id={`${scope}-${id}`}>{children}</linearGradient>;
}

function RadialGradient({ children, id, ...props }: ComponentProps<Kit["RadialGradient"]>) {
  const scope = useContext(IdScope);
  return <radialGradient {...props} id={`${scope}-${id}`}>{children}</radialGradient>;
}

function Page({ style, children, cover, label }: PageProps) {
  return (
    <section className={cover ? "k-page is-cover" : "k-page"} style={toCss(style ?? {})} aria-label={label} data-a="sheet">
      {children}
    </section>
  );
}

export function SheetProvider({ index, total, children }: { index: number; total: number; children: ReactNode }) {
  return <Sheet.Provider value={{ index, total }}>{children}</Sheet.Provider>;
}

function PageNo({ style, format }: { style?: Style; format: (page: number, total: number) => string }) {
  const sheet = useContext(Sheet);
  return <WebT style={{ ...style, flexShrink: 0, whiteSpace: "nowrap" } as Style}>{format(sheet.index, sheet.total)}</WebT>;
}

const ease = (t: number) => 1 - (1 - t) ** 3;

/** Counts up to the exact amount the first time it becomes visible. The real value is always in the DOM. */
function Amount({ style, cents, text, format, a, i }: AmountProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const played = useRef(false);
  const target = useRef({ cents, format });
  useEffect(() => {
    target.current = { cents, format };
  });
  const [frame, setFrame] = useState<string | null>(null);
  useEffect(() => {
    const node = ref.current;
    if (played.current || !node || typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !node.closest(".qd-anim")) return;
    let raf = 0;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        played.current = true;
        const start = performance.now();
        const tick = (now: number) => {
          const progress = Math.min(1, (now - start) / 900);
          const { cents: goal, format: show } = target.current;
          setFrame(progress >= 1 ? null : show(Math.round((goal * ease(progress)) / 100) * 100));
          if (progress < 1) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      },
      { threshold: 0.15 },
    );
    observer.observe(node);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(raf);
    };
  }, []);
  return (
    <WebT style={style} a={a} i={i}>
      <span ref={ref} className="k-amount">
        <span className="visually-hidden">{text}</span>
        <span aria-hidden="true">{frame ?? text}</span>
      </span>
    </WebT>
  );
}

function Figure({ style, children, label, table, a, i, stack }: FigureProps) {
  return (
    <>
      <div className="k-v" role="img" aria-label={label} style={{ ...toCss(flatten(style)), ...motionStyle({ i }) }} {...motionAttrs({ a })} data-stack={stack ? "" : undefined}>
        {children}
      </div>
      {table.rows.length ? (
        <table className="visually-hidden">
          <thead>
            <tr>
              {table.head.map((cell) => (
                <th key={cell} scope="col">
                  {cell}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row, index) => (
              <tr key={index}>
                {row.map((cell, column) => (column === 0 ? <th key={column} scope="row">{cell}</th> : <td key={column}>{cell}</td>))}
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </>
  );
}

/** The plain web kit never prints anchors (`edit` is not read): preview, thumbnails and the public page stay as they are. */
export const webKit: Kit = {
  mode: "web",
  Page,
  V: WebV,
  T: WebT,
  Img,
  Svg,
  Path: shape("path"),
  Circle: shape("circle"),
  Rect: shape("rect"),
  Line: shape("line"),
  Ellipse: shape("ellipse"),
  G: shape("g"),
  Defs: ({ children }) => <defs>{children}</defs>,
  LinearGradient,
  RadialGradient,
  Stop: (props) => <stop {...props} />,
  PageNo,
  Amount,
  Figure,
};
