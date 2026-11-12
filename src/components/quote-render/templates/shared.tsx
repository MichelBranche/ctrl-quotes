import type { ReactNode } from "react";
import type { EditAnchor, EditKind, FieldPath } from "@/domain/document-ops";
import { fonts, type Kit, type Style } from "../kit";
import type { Condition, DocModel, Row } from "../model";

/** Building blocks shared by the five templates. Pure functions of (kit, data): no hooks. */

/**
 * Anchor of a printed value for the visual editor. Web and PDF ignore it: adding one never changes
 * the output (tests/render-parity.test.ts).
 */
export function anchor(blockId: string | null | undefined, field: FieldPath, kind: EditKind = "line"): EditAnchor | undefined {
  return blockId ? { blockId, field, kind } : undefined;
}

/** The stored field behind a terms column. Validity is computed from the quote date: not editable here. */
export function conditionAnchor(blockId: string, column: Condition): EditAnchor | undefined {
  const field = column.key === "payment" ? "payment" : column.key === "notes" ? "notes" : column.key === "general" ? "body" : null;
  return field ? anchor(blockId, field, "multiline") : undefined;
}

type IconShape =
  | { t: "path"; d: string; fill?: boolean }
  | { t: "circle"; cx: number; cy: number; r: number; fill?: boolean }
  | { t: "rect"; x: number; y: number; width: number; height: number; rx?: number }
  | { t: "ellipse"; cx: number; cy: number; rx: number; ry: number };

export const iconShapes: Record<string, IconShape[]> = {
  visibility: [
    { t: "path", d: "M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" },
    { t: "circle", cx: 12, cy: 12, r: 3 },
  ],
  contacts: [
    { t: "rect", x: 3, y: 4, width: 18, height: 16, rx: 2 },
    { t: "circle", cx: 9, cy: 10, r: 2 },
    { t: "path", d: "M5.5 17c.4-2 2-3 3.5-3s3.1 1 3.5 3M15 9h4M15 13h4" },
  ],
  value: [{ t: "path", d: "m2 19 7-7 5 4 8-11M16 5h6v6" }],
  target: [
    { t: "circle", cx: 12, cy: 12, r: 9 },
    { t: "circle", cx: 12, cy: 12, r: 5 },
    { t: "path", d: "m12 12 9-9" },
  ],
  layers: [{ t: "path", d: "m12 2 10 6-10 6L2 8zM2 12l10 6 10-6M2 16l10 6 10-6" }],
  performance: [{ t: "path", d: "M14 2 5 13h7l-2 9 10-12h-7z" }],
  control: [{ t: "path", d: "m12 2 10 6-10 6L2 8zM2 13l10 6 10-6M2 18l10 5 10-5" }],
  results: [{ t: "path", d: "M4 20 20 4M9 4h11v11" }],
  info: [
    { t: "circle", cx: 12, cy: 12, r: 9 },
    { t: "path", d: "M12 11v6M12 7.6v.4" },
  ],
  payment: [
    { t: "rect", x: 2, y: 5, width: 20, height: 14, rx: 2 },
    { t: "path", d: "M2 10h20M6 15h5" },
  ],
  calendar: [
    { t: "rect", x: 3, y: 5, width: 18, height: 16, rx: 2 },
    { t: "path", d: "M7 2v6M17 2v6M3 10h18" },
  ],
  notes: [
    { t: "circle", cx: 12, cy: 12, r: 9 },
    { t: "path", d: "M12 11v6M12 7v.5" },
  ],
  document: [{ t: "path", d: "M6 2h9l5 5v15H6zM15 2v5h5M9 12h8M9 16h8" }],
  clock: [
    { t: "circle", cx: 12, cy: 12, r: 9 },
    { t: "path", d: "M12 6v6l4 2" },
  ],
  coins: [
    { t: "ellipse", cx: 12, cy: 5, rx: 8, ry: 3 },
    { t: "path", d: "M4 5v12c0 4 16 4 16 0V5M4 11c0 4 16 4 16 0" },
  ],
};

/** Highlight icon per template family: the line icons of each design package. */
export const highlightGlyph: Record<"corporate" | "bold", Record<string, string>> = {
  corporate: { visibility: "target", contacts: "layers", value: "value", performance: "performance", control: "layers", results: "value" },
  bold: { visibility: "visibility", contacts: "contacts", value: "value", performance: "performance", control: "control", results: "results" },
};

export function Icon({ k, name, size, color, width = 1.7 }: { k: Kit; name: string; size: number; color: string; width?: number }) {
  const shapes = iconShapes[name] ?? iconShapes.notes ?? [];
  const common = { stroke: color, strokeWidth: width, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, fill: "none" };
  return (
    <k.Svg width={size} height={size} viewBox="0 0 24 24">
      {shapes.map((shape, index) => {
        switch (shape.t) {
          case "path":
            return <k.Path key={index} d={shape.d} {...common} />;
          case "circle":
            return <k.Circle key={index} cx={shape.cx} cy={shape.cy} r={shape.r} {...common} />;
          case "rect":
            return <k.Rect key={index} x={shape.x} y={shape.y} width={shape.width} height={shape.height} rx={shape.rx} {...common} />;
          case "ellipse":
            return <k.Ellipse key={index} cx={shape.cx} cy={shape.cy} rx={shape.rx} ry={shape.ry} {...common} />;
          default:
            return null;
        }
      })}
    </k.Svg>
  );
}

/** Geometric marks drawn from the design packages, recoloured with the accent. */
export function Mark({ k, kind, color, height }: { k: Kit; kind: "corporate" | "bold" | "studio"; color: string; height: number }) {
  if (kind === "corporate") {
    return (
      <k.Svg width={(height * 40) / 48} height={height} viewBox="0 0 40 48">
        <k.Path d="M13 2H40L27 46H0Z" fill={color} />
      </k.Svg>
    );
  }
  if (kind === "bold") {
    return (
      <k.Svg width={(height * 36) / 24} height={height} viewBox="7 0 36 24">
        <k.Path d="M7 24h23L43 0H20z" fill={color} />
      </k.Svg>
    );
  }
  // Studio Editorial: a folded leaf, a slanted quadrilateral with one rounded flank, as in the mockup.
  return (
    <k.Svg width={height * 1.18} height={height} viewBox="0 0 46 39">
      <k.Path d="M15.5 1.5 H43 C44.6 1.5 45.4 2.6 44.8 4 C40.6 15.6 35.8 28.4 29.2 35.4 C27.4 37.2 25.6 37.6 23 37.6 H3 C1.4 37.6 .6 36.4 1.2 35 C5.4 23.6 10 11 13 3.6 C13.5 2.3 14.2 1.5 15.5 1.5 Z" fill={color} />
    </k.Svg>
  );
}

/**
 * Issuer identity: the uploaded logo, or the template mark and the company name.
 * A logo that would disappear on the background sits on a small contrasting plate.
 */
export function Brand({
  k,
  m,
  dark,
  height,
  nameStyle,
  mark,
  markColor,
  gap = 6,
  maxWidth = 150,
}: {
  k: Kit;
  m: DocModel;
  dark: boolean;
  height: number;
  nameStyle: Style;
  mark?: "corporate" | "bold" | "studio";
  markColor?: string;
  gap?: number;
  maxWidth?: number;
}) {
  if (m.logo) {
    const width = Math.min(maxWidth, height * (m.logo.aspect ?? 3));
    const clash = (dark && m.logo.tone === "dark") || (!dark && m.logo.tone === "light");
    const image = <k.Img src={m.logo.src} alt={m.issuer.display} style={{ width, height, objectFit: "contain" }} />;
    return clash ? (
      <k.V style={{ flexDirection: "row", alignSelf: "flex-start", padding: 5, borderRadius: 3, backgroundColor: dark ? "#FFFFFF" : "#141414" }}>{image}</k.V>
    ) : (
      <k.V style={{ flexDirection: "row", alignSelf: "flex-start" }}>{image}</k.V>
    );
  }
  return (
    <k.V style={{ flexDirection: "row", alignItems: "center" }}>
      {mark ? (
        <k.V style={{ marginRight: gap }}>
          <Mark k={k} kind={mark} color={markColor ?? m.accent} height={height * 0.62} />
        </k.V>
      ) : null}
      <k.T style={nameStyle}>{m.issuer.display}</k.T>
    </k.V>
  );
}

export function Paras({ k, text, style, gap = 4, edit }: { k: Kit; text: string; style?: Style; gap?: number; edit?: EditAnchor }) {
  const parts = text
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (!parts.length) return null;
  return (
    <k.V edit={edit}>
      {parts.map((part, index) => (
        <k.T key={index} style={{ ...style, marginTop: index ? gap : 0 }}>
          {part}
        </k.T>
      ))}
    </k.V>
  );
}

export type Column = {
  key: "name" | "description" | "quantity" | "price" | "vat" | "net";
  label: string;
  width: number | string;
  align?: "left" | "center" | "right";
};

/** Six-column services table or three-column options table, styled per template. */
export function LineTable({
  k,
  rows,
  columns,
  head,
  headText,
  cell,
  nameCell,
  rowStyle,
  zebra,
  empty,
  blockId,
}: {
  k: Kit;
  /** Services or options block the rows belong to: anchors name, description, quantity and price. */
  blockId?: string;
  rows: Row[];
  columns: Column[];
  head: Style;
  headText: Style;
  cell: Style;
  nameCell: Style;
  rowStyle: Style;
  zebra?: string;
  empty: Style;
}) {
  if (!rows.length) return <k.T style={empty}>Nessuna voce in questa sezione.</k.T>;
  return (
    <k.V scrollX>
      <k.V style={{ minWidth: 0 }}>
        <k.V style={{ ...head, flexDirection: "row" }} fixed>
          {columns.map((column) => (
            <k.T key={column.key} style={{ ...headText, width: column.width, textAlign: column.align ?? "left" }}>
              {column.label}
            </k.T>
          ))}
        </k.V>
        {rows.map((row, index) => (
          <k.V
            key={row.id}
            wrap={false}
            a="row"
            i={index}
            hover="row"
            style={{ ...rowStyle, flexDirection: "row", backgroundColor: zebra && index % 2 === 1 ? zebra : rowStyle.backgroundColor }}
          >
            {columns.map((column) => (
              <k.V key={column.key} style={{ width: column.width, paddingRight: column.align === "right" ? 0 : 4 }}>
                <k.T edit={cellAnchor(blockId, row.id, column.key)} style={{ ...(column.key === "name" ? nameCell : cell), textAlign: column.align ?? "left" }}>
                  {row[column.key]}
                </k.T>
                {column.key === "name" && row.tags.length ? <k.T style={{ ...cell, opacity: 0.7, marginTop: 1.5 }}>{row.tags.join(" · ")}</k.T> : null}
              </k.V>
            ))}
          </k.V>
        ))}
      </k.V>
    </k.V>
  );
}

function cellAnchor(blockId: string | undefined, lineId: string, column: Column["key"]): EditAnchor | undefined {
  switch (column) {
    case "name":
      return anchor(blockId, `items.${lineId}.name`);
    case "description":
      return anchor(blockId, `items.${lineId}.description`, "multiline");
    case "quantity":
      return anchor(blockId, `items.${lineId}.quantityMilli`, "quantity");
    case "price":
      return anchor(blockId, `items.${lineId}.unitPriceCents`, "money");
    default:
      return undefined;
  }
}

export function servicesColumns(m: DocModel, widths: [number, number, number, number, number, number]): Column[] {
  const columns: Column[] = [
    { key: "name", label: "Voce", width: `${widths[0]}%` },
    { key: "description", label: "Descrizione", width: `${widths[1]}%` },
    { key: "quantity", label: "Q.tà", width: `${widths[2]}%`, align: "center" },
    { key: "price", label: "Prezzo", width: `${widths[3]}%`, align: "right" },
    { key: "vat", label: "IVA", width: `${widths[4]}%`, align: "center" },
    { key: "net", label: "Imponibile", width: `${widths[5]}%`, align: "right" },
  ];
  if (m.ordinario) return columns;
  // Without VAT the column disappears and the description takes its room.
  return columns
    .filter((column) => column.key !== "vat")
    .map((column) => (column.key === "description" ? { ...column, width: `${widths[1] + widths[4]}%` } : column));
}

export function optionsColumns(m: DocModel, widths: [number, number, number]): Column[] {
  return [
    { key: "name", label: "Voce", width: `${widths[0]}%` },
    { key: "description", label: "Descrizione", width: `${widths[1]}%` },
    { key: "net", label: m.ordinario ? "Prezzo (IVA escl.)" : "Prezzo", width: `${widths[2]}%`, align: "right" },
  ];
}

export function Watermark({ k, m, style }: { k: Kit; m: DocModel; style: Style }) {
  return m.watermark ? (
    <k.T fixed style={{ position: "absolute", top: 8, left: 0, right: 0, textAlign: "center", fontFamily: fonts.sans, fontSize: 6.5, letterSpacing: 1.4, textTransform: "uppercase", ...style }}>
      {m.watermark}
    </k.T>
  ) : null;
}

export const pad = (value: number) => String(value).padStart(2, "0");

export function Spacer({ k, h }: { k: Kit; h: number }): ReactNode {
  return <k.V style={{ height: h }} />;
}

/** Horizontal timeline drawn from the steps: nodes on a rule, labels under or above. */
export function timelineX(count: number, index: number): number {
  return count <= 1 ? 0 : index / (count - 1);
}
