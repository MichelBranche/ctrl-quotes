import type { ComponentType, ReactNode } from "react";
import type { EditAnchor } from "@/domain/document-ops";

/**
 * One template source, two renderers. Templates are written once against this small kit of
 * primitives with react-pdf semantics (flex column by default, sizes in pt). The web kit maps
 * them to DOM elements with the same box model, the PDF kit to @react-pdf/renderer.
 * Animation hints (`a`, `i`) only exist on the web; the PDF prints the final state.
 */
export type Style = { [property: string]: string | number | undefined };

/** Web-only motion hint: entrance, stagger index, hover. */
export type Motion = {
  a?: "sheet" | "rise" | "fade" | "row" | "bar" | "line" | "node" | "arc" | "stagger" | "donut";
  i?: number;
  hover?: "row" | "box";
};

export type ViewProps = Motion & {
  style?: Style | Array<Style | false | null | undefined>;
  children?: ReactNode;
  /** Repeated on every PDF page this content overflows to. */
  fixed?: boolean;
  /** False keeps the element on one PDF page. */
  wrap?: boolean;
  /**
   * Never split across PDF pages, also when the element would cross the page end: the PDF kit then
   * passes no `fixed` key at all (react-pdf skips the page-break check for any node that has one).
   */
  keep?: boolean;
  /** Starts a new PDF page. */
  breakBefore?: boolean;
  /** PDF: move to the next page when less than this many pt remain. */
  minPresenceAhead?: number;
  /** Web: collapses this row into a column on narrow screens. */
  stack?: boolean;
  /** Web: lets a wide table scroll horizontally on narrow screens. */
  scrollX?: boolean;
  /** Web: on narrow screens children align to the start (for staggered PDF columns). */
  flowStart?: boolean;
  /** Web: a row of side-by-side blocks; on narrow screens the columns stack with room between them. */
  columns?: boolean;
  /** Editor: block highlighted when selected. The PDF also tags the element with it for the pagination pass. */
  blockId?: string;
  /** PDF: tag read by the pagination pass, for elements without a block (rows of columns). */
  printId?: string;
  /** Visual editor: the stored value this region prints. Only the edit kit reads it; web and PDF ignore it. */
  edit?: EditAnchor;
};

export type TextProps = Motion & {
  style?: Style | Array<Style | false | null | undefined>;
  children?: ReactNode;
  fixed?: boolean;
  /** Decorative text, hidden from assistive technology on the web. */
  decorative?: boolean;
  /** Visual editor: the stored value this text prints. Only the edit kit reads it; web and PDF ignore it. */
  edit?: EditAnchor;
};

export type ImageProps = Motion & { src: string; style?: Style; alt?: string };

export type SvgProps = Motion & { width: number; height: number; viewBox: string; style?: Style; children?: ReactNode; preserveAspectRatio?: string };
export type ShapeProps = {
  d?: string;
  cx?: number;
  cy?: number;
  r?: number;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  rx?: number;
  x1?: number;
  x2?: number;
  y1?: number;
  y2?: number;
  ry?: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  strokeLinecap?: "round" | "butt" | "square";
  strokeLinejoin?: "round" | "miter" | "bevel";
  fillOpacity?: number;
  opacity?: number;
  children?: ReactNode;
};
export type StopProps = { offset: string; stopColor: string; stopOpacity?: number };

export type AmountProps = Motion & { style?: Style | Array<Style | false | null | undefined>; cents: number; text: string; format: (cents: number) => string };

/**
 * A chart: on the web an image for assistive technology (role img, `label` as its summary) followed
 * by the same data as a visually hidden table. In the PDF a plain box.
 */
export type FigureProps = Motion & {
  style?: Style | Array<Style | false | null | undefined>;
  children?: ReactNode;
  label: string;
  table: { head: string[]; rows: string[][] };
  stack?: boolean;
};

export type PageProps = {
  style?: Style;
  children?: ReactNode;
  /** Cover pages never break. */
  cover?: boolean;
  label: string;
};

export type Kit = {
  mode: "web" | "pdf";
  Page: ComponentType<PageProps>;
  V: ComponentType<ViewProps>;
  T: ComponentType<TextProps>;
  Img: ComponentType<ImageProps>;
  Svg: ComponentType<SvgProps>;
  Path: ComponentType<ShapeProps>;
  Circle: ComponentType<ShapeProps>;
  Rect: ComponentType<ShapeProps>;
  Line: ComponentType<ShapeProps>;
  Ellipse: ComponentType<ShapeProps>;
  G: ComponentType<ShapeProps>;
  Defs: ComponentType<{ children?: ReactNode }>;
  LinearGradient: ComponentType<{ id: string; x1: string; y1: string; x2: string; y2: string; children?: ReactNode }>;
  RadialGradient: ComponentType<{ id: string; cx: string; cy: string; r: string; fx?: string; fy?: string; children?: ReactNode }>;
  Stop: ComponentType<StopProps>;
  /** "02 / 03" style page counter. The web knows its sheet index, the PDF its real page. */
  PageNo: ComponentType<{ style?: Style; format: (page: number, total: number) => string }>;
  /** A money amount that counts up on the web. `text` is the exact final string. */
  Amount: ComponentType<AmountProps>;
  Figure: ComponentType<FigureProps>;
};

export const fonts = {
  sans: "CQInter",
  serif: "CQCormorant",
  display: "CQArchivo",
  /** Serif with lining figures, for big amounts and numbering. */
  figures: "CQFigures",
} as const;

export function flatten(style: ViewProps["style"]): Style {
  if (!style) return {};
  if (!Array.isArray(style)) return style;
  return Object.assign({}, ...style.filter(Boolean));
}

export const mm = (value: number) => value * 2.8346;
