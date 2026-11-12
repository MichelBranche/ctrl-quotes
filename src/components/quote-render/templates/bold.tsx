import type { ReactElement } from "react";
import type { EditAnchor } from "@/domain/document-ops";
import { fonts, type Kit, type Style } from "../kit";
import { euro, fitTitle, mix, subtitleLines, type DocModel, type MoneyGroup, type Section } from "../model";
import { anchor, Brand, conditionAnchor, highlightGlyph, Icon, LineTable, optionsColumns, pad, Paras, servicesColumns, Watermark } from "./shared";

/** Bold Impact: black and orange, giant display type, a parametric glowing arc, dark bands on the last page. */

const c = {
  ink: "#101010",
  paper: "#FAF9F7",
  white: "#FFFFFF",
  muted: "#ECEBE9",
  line: "#B9B8B6",
  secondary: "#888888",
  grayBar: "#C9C9C9",
  onDark: "#D9D9D9",
};
const P = 22; // 8 mm, the mockup bleeds close to the edge
const sans = fonts.sans;
const display = fonts.display;
const W = 595.28;

const t = {
  body: { fontSize: 10.8, lineHeight: 1.45, color: c.ink } as Style,
  small: { fontSize: 9.2, lineHeight: 1.4, color: c.ink } as Style,
};

type Breakdown = { kind: "breakdown"; id: string; no: number; groups: MoneyGroup[] };
type Item = Section | Breakdown;

/**
 * Glowing orange planet: a circle whose rim is the accent and whose body fades into the page black.
 * Drawn as vectors so it follows the accent colour and stays sharp in print.
 */
function Arc({ k, accent, id, width, height, cx, cy, r, fade, style }: { k: Kit; accent: string; id: string; width: number; height: number; cx: number; cy: number; r: number; fade: number; style: Style }) {
  const glow = r + 34;
  const inner = 1 - fade / r;
  return (
    <k.Svg a="arc" width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ position: "absolute", ...style }}>
      <k.Defs>
        <k.RadialGradient id={`${id}-body`} cx="0.5" cy="0.5" r="0.5">
          <k.Stop offset="0" stopColor={c.ink} />
          <k.Stop offset={String(inner)} stopColor={mix(accent, c.ink, 0.9)} />
          <k.Stop offset={String(1 - (1 - inner) * 0.4)} stopColor={mix(accent, c.ink, 0.5)} />
          <k.Stop offset={String(1 - (1 - inner) * 0.1)} stopColor={mix(accent, c.ink, 0.1)} />
          <k.Stop offset="1" stopColor={accent} />
        </k.RadialGradient>
        <k.RadialGradient id={`${id}-glow`} cx="0.5" cy="0.5" r="0.5">
          <k.Stop offset={String(r / glow - 0.01)} stopColor={accent} stopOpacity={0.55} />
          <k.Stop offset="1" stopColor={accent} stopOpacity={0} />
        </k.RadialGradient>
      </k.Defs>
      <k.Circle cx={cx} cy={cy} r={glow} fill={`url(#${id}-glow)`} />
      <k.Circle cx={cx} cy={cy} r={r} fill={`url(#${id}-body)`} />
    </k.Svg>
  );
}

function SectionHead({ k, m, no, title, dark, extra, edit }: { k: Kit; m: DocModel; no: number; title: string; dark: boolean; extra?: string; edit?: EditAnchor }) {
  return (
    <k.V style={{ flexDirection: "row", alignItems: "baseline", marginBottom: 12 }}>
      {no ? <k.T style={{ fontSize: 13.5, fontWeight: 800, color: dark ? m.accent : m.accentText(c.paper), width: 34 }}>{pad(no)}</k.T> : null}
      <k.T edit={edit} style={{ fontSize: 13.5, fontWeight: 800, color: dark ? c.white : c.ink, letterSpacing: -0.3 }}>
        {title}
        {extra ? <k.T style={{ fontSize: 11, fontWeight: 400 }}>{`  ${extra}`}</k.T> : null}
      </k.T>
    </k.V>
  );
}

function Header({ k, m, dark, fixed }: { k: Kit; m: DocModel; dark: boolean; fixed?: boolean }) {
  const ink = dark ? c.white : c.ink;
  return (
    <k.V fixed={fixed} style={{ paddingHorizontal: P, paddingTop: 28, marginBottom: 16 }}>
      <k.V style={{ flexDirection: "row", alignItems: "center", paddingBottom: 15, borderBottomWidth: 0.6, borderBottomColor: dark ? "#5A5A5A" : c.line }}>
        <k.V style={{ width: "46%" }}>
          <Brand k={k} m={m} dark={dark} height={22} mark="bold" gap={9} nameStyle={{ fontSize: 14.5, fontWeight: 800, color: ink, letterSpacing: -0.3 }} />
        </k.V>
        <k.V style={{ flexGrow: 1 }}>
          <k.T style={{ fontSize: 9.2, lineHeight: 1.35, color: ink }}>{`Proposta per ${m.header.client}\n${m.header.title}`}</k.T>
        </k.V>
        <k.PageNo style={{ fontSize: 10.5, color: ink }} format={(page, total) => `${pad(page)} / ${pad(total)}`} />
      </k.V>
    </k.V>
  );
}

function coverTitle(title: string): string {
  const words = title.trim().toUpperCase().split(/\s+/);
  return words.length <= 4 && words.every((word) => word.length <= 9) ? words.join("\n") : words.join(" ");
}

function Cover({ k, m }: { k: Kit; m: DocModel }) {
  const cover = m.cover;
  if (!cover) return null;
  const lines = coverTitle(cover.title);
  const size = lines.includes("\n") ? (lines.split("\n").length > 3 ? 92 : 112) : fitTitle(cover.title, 96, 52);
  const meta = [
    ...(cover.project ? [{ label: "Progetto", value: cover.project, edit: anchor(cover.id, "project") }] : []),
    ...(cover.validityShort ? [{ label: "Validità", value: cover.validityShort }] : []),
    m.versionLabel ? { label: "Versione", value: m.versionLabel } : { label: "Data", value: cover.dateShort },
  ];
  return (
    <k.Page cover label="Copertina" style={{ backgroundColor: c.ink, color: c.white, fontFamily: sans }}>
      {cover.coverPhoto ? (
        <k.Img a="fade" src={cover.coverPhoto} style={{ position: "absolute", top: 0, left: 0, width: "100%", height: 838, objectFit: "cover" }} />
      ) : (
        <Arc k={k} accent={m.accent} id="bi-cover" width={W} height={560} cx={W} cy={668} r={512} fade={170} style={{ left: 0, bottom: 0 }} />
      )}
      <Watermark k={k} m={m} style={{ color: c.secondary }} />
      <k.V blockId={cover.id ?? undefined} style={{ flexGrow: 1, paddingHorizontal: P + 18, paddingTop: 44, paddingBottom: 30 }}>
        <k.V a="fade" style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" }}>
          <Brand k={k} m={m} dark height={40} mark="bold" gap={12} maxWidth={200} nameStyle={{ fontSize: 22, fontWeight: 800, lineHeight: 1.02, letterSpacing: -0.6, color: c.white, maxWidth: 130 }} />
          <k.T style={{ fontSize: 10.4, lineHeight: 1.4, color: c.white }}>{`Proposta commerciale\nN. ${cover.number}${cover.dateShort ? `\n${cover.dateShort}` : ""}`}</k.T>
        </k.V>
        <k.T a="rise" edit={anchor(cover.id, "title")} style={{ fontFamily: display, fontSize: size, lineHeight: 0.9, letterSpacing: -size * 0.025, color: "#F7F5F0", marginTop: 96 }}>
          {lines}
          <k.T style={{ color: m.accent }}>.</k.T>
        </k.T>
        {cover.subtitle ? (
          <k.T a="fade" i={2} edit={anchor(cover.id, "subtitle", "multiline")} style={{ fontSize: 26, fontWeight: 500, lineHeight: 1.15, letterSpacing: -0.5, color: c.white, marginTop: 36, maxWidth: "62%" }}>
            {subtitleLines(cover.subtitle)}
          </k.T>
        ) : null}
        {m.issuer.tagline ? (
          <k.T edit={anchor(cover.id, "tagline")} style={{ fontSize: 11, color: c.onDark, marginTop: 12, maxWidth: "55%" }}>
            {m.issuer.tagline}
          </k.T>
        ) : null}
        <k.V style={{ flexGrow: 1 }} />
        <k.V style={{ flexDirection: "row", borderTopWidth: 0.6, borderTopColor: "#BDBDBD", paddingTop: 16 }} stack>
          {meta.map((item, index) => (
            <k.V key={item.label} style={{ flex: index === meta.length - 1 ? 0.6 : 1, paddingLeft: index ? 18 : 0, borderLeftWidth: index ? 0.6 : 0, borderLeftColor: "#BDBDBD", paddingVertical: 3 }}>
              <k.T style={{ fontSize: 9.4, color: c.white }}>{item.label}</k.T>
              <k.T edit={"edit" in item ? item.edit : undefined} style={{ fontSize: 9.4, color: c.white, marginTop: 3 }}>
                {item.value}
              </k.T>
            </k.V>
          ))}
        </k.V>
      </k.V>
    </k.Page>
  );
}

function SummaryBand({ k, m, s }: { k: Kit; m: DocModel; s: Extract<Section, { kind: "summary" }> }) {
  return (
    <k.V blockId={s.id} style={{ paddingHorizontal: P, paddingBottom: 18 }}>
      <SectionHead k={k} m={m} no={s.no} title={s.heading} dark edit={anchor(s.id, "heading")} />
      {s.groups.map((group, index) => (
        <k.V key={group.key} wrap={false} stack style={{ flexDirection: "row", marginTop: index ? 10 : 0 }}>
          <k.V style={{ width: "53%", paddingRight: 10 }}>
            <k.Amount a="rise" cents={group.totalCents} text={group.headline} format={(cents) => euro(cents).replace(/,00$/, "")} style={{ fontFamily: display, fontSize: 56, lineHeight: 1, letterSpacing: -1.6, color: index === 0 ? "#F7F5F0" : m.accent }} />
            <k.T style={{ fontSize: 9.6, fontWeight: 800, letterSpacing: 1.6, textTransform: "uppercase", color: c.white, marginTop: 2 }}>{group.title}</k.T>
            {group.caption ? <k.T style={{ fontSize: 9.6, color: c.onDark, marginTop: 1 }}>{`(${group.caption})`}</k.T> : null}
          </k.V>
          <k.V style={{ flexGrow: 1, flexBasis: 0, paddingLeft: 18, borderLeftWidth: 0.6, borderLeftColor: "#6A6A6A", justifyContent: "center" }}>
            {group.rows.map((row) => (
              <k.V key={row.label} style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 5 }}>
                <k.T style={{ ...t.small, color: c.white }}>{row.label}</k.T>
                <k.T style={{ ...t.small, color: c.white }}>{row.value}</k.T>
              </k.V>
            ))}
            <k.V style={{ flexDirection: "row", justifyContent: "space-between", borderTopWidth: 0.6, borderTopColor: "#8A8A8A", paddingTop: 8, marginTop: 3 }}>
              <k.T style={{ fontSize: 11, fontWeight: 800, color: c.white }}>Totale</k.T>
              <k.T style={{ fontSize: 11, fontWeight: 800, color: c.white }}>{group.total}</k.T>
            </k.V>
          </k.V>
        </k.V>
      ))}
      {s.notices.map((notice) => (
        <k.T key={notice} style={{ ...t.small, color: c.onDark, marginTop: 6 }}>
          {notice}
        </k.T>
      ))}
      {s.body ? <Paras k={k} text={s.body} edit={anchor(s.id, "body", "multiline")} style={{ ...t.small, color: c.onDark, marginTop: 6 }} /> : null}
    </k.V>
  );
}

function BreakdownBand({ k, m, b }: { k: Kit; m: DocModel; b: Breakdown }) {
  const rows = m.breakdown;
  const max = Math.max(...rows.map((row) => row.share), 0.0001);
  const onAccent = m.onAccent;
  return (
    <k.V wrap={false} a="rise" style={{ paddingHorizontal: P, paddingTop: 10, paddingBottom: 14 }}>
      <k.V style={{ borderTopWidth: 0.6, borderTopColor: c.line, paddingTop: 11 }} />
      <k.V stack style={{ flexDirection: "row" }}>
        <k.V style={{ flexGrow: 1, flexBasis: 0, paddingRight: 24 }}>
          <SectionHead k={k} m={m} no={b.no} title="Totale del progetto" dark={false} />
          {rows.map((row, index) => (
            <k.V key={row.id} style={{ flexDirection: "row", alignItems: "center", marginBottom: 5 }}>
              <k.T style={{ fontSize: 9, color: c.ink, width: 112 }}>{row.name}</k.T>
              <k.V style={{ width: 150, height: 13 }}>
                <k.V a="bar" i={index} style={{ width: `${Math.max(4, (row.share / max) * 100)}%`, height: 13, backgroundColor: index === 0 ? m.accent : index === 1 ? "#24262B" : c.grayBar }} />
              </k.V>
              <k.T style={{ fontSize: 9, color: c.ink, marginLeft: 8 }}>{row.percent}</k.T>
            </k.V>
          ))}
        </k.V>
        <k.V hover="box" style={{ width: 172, backgroundColor: m.accent, borderRadius: 7, paddingVertical: 14, paddingHorizontal: 15, marginTop: -6 }}>
          {b.groups.map((group, index) => (
            <k.V key={group.key} style={{ borderTopWidth: index ? 0.6 : 0, borderTopColor: onAccent, paddingTop: index ? 10 : 0, marginTop: index ? 10 : 0 }}>
              <k.T style={{ fontSize: 10.6, fontWeight: 800, color: onAccent }}>{group.key === "oneTime" ? "Totale una tantum" : group.title}</k.T>
              <k.T style={{ fontFamily: display, fontSize: 30, lineHeight: 1.05, letterSpacing: -0.8, color: onAccent, marginTop: 2 }}>{group.headline}</k.T>
            </k.V>
          ))}
        </k.V>
      </k.V>
    </k.V>
  );
}

const termIcons: Record<string, string> = { payment: "payment", validity: "calendar", notes: "info", general: "document" };

function Block({ k, m, s, first, last }: { k: Kit; m: DocModel; s: Item; first: boolean; last: boolean }): ReactElement | null {
  const light = (children: ReactElement, opts: { extra?: string; gap?: number; title?: string } = {}) => (
    <k.V blockId={s.id} a="rise" style={{ paddingHorizontal: P, marginTop: first ? 0 : (opts.gap ?? 16) }}>
      {first ? null : <k.V style={{ borderTopWidth: 0.6, borderTopColor: c.line, marginBottom: 13 }} />}
      {"heading" in s ? <SectionHead k={k} m={m} no={s.no} title={opts.title ?? s.heading} dark={false} extra={opts.extra} edit={opts.title === undefined ? anchor(s.id, "heading") : undefined} /> : null}
      {children}
    </k.V>
  );
  const dark = (children: ReactElement) => (
    <k.V blockId={s.id} style={{ backgroundColor: c.ink, paddingHorizontal: P, paddingTop: 13, paddingBottom: 13, flexGrow: last ? 1 : 0 }}>
      {"heading" in s ? <SectionHead k={k} m={m} no={s.no} title={s.heading} dark edit={anchor(s.id, "heading")} /> : null}
      {children}
    </k.V>
  );
  const table = {
    head: { backgroundColor: c.ink, borderRadius: 2, paddingVertical: 7, paddingHorizontal: 8 },
    headText: { fontSize: 8.8, fontWeight: 700, color: c.white },
    nameCell: { fontSize: 8.8, fontWeight: 700, color: c.ink, lineHeight: 1.3 },
    cell: { fontSize: 8.4, color: c.ink, lineHeight: 1.34 },
    zebra: c.muted,
    empty: { ...t.small, color: c.secondary },
  };
  switch (s.kind) {
    case "intro":
      return light(
        <k.V stack style={{ flexDirection: "row" }}>
          <k.T
            edit={s.lead ? anchor(s.id, "lead", "multiline") : anchor(s.id, "heading")}
            style={{ width: "61%", fontSize: 33, fontWeight: 800, letterSpacing: -1.3, lineHeight: 1.02, color: c.ink, paddingRight: 14 }}
          >
            {s.lead || s.heading}
          </k.T>
          <k.V style={{ flexGrow: 1, flexBasis: 0, paddingTop: 2 }}>
            <Paras k={k} edit={anchor(s.id, "body", "multiline")} text={s.body || "Descrivi qui il progetto e gli obiettivi del cliente."} style={{ ...t.body, color: s.body ? c.ink : c.secondary }} />
            {s.points.map((point, index) => (
              <k.T key={index} edit={anchor(s.id, `points.${s.pointIndexes[index] ?? index}`)} style={{ ...t.small, marginTop: index ? 2 : 6 }}>{`• ${point}`}</k.T>
            ))}
            {s.quote ? <k.T edit={anchor(s.id, "quote", "multiline")} style={{ fontSize: 12, fontWeight: 700, color: c.ink, marginTop: 8 }}>{`“${s.quote}”`}</k.T> : null}
          </k.V>
        </k.V>,
      );
    case "text":
      return light(<Paras k={k} text={s.body} edit={anchor(s.id, "body", "multiline")} style={t.body} />);
    case "image":
      return s.src ? (
        <k.V blockId={s.id} a="fade" style={{ marginTop: 16, paddingHorizontal: P }} wrap={false}>
          <k.Img src={s.src} alt={s.alt} style={{ width: "100%", height: 210, objectFit: "cover" }} />
          {s.caption ? (
            <k.T edit={anchor(s.id, "caption")} style={{ ...t.small, color: c.secondary, marginTop: 5 }}>
              {s.caption}
            </k.T>
          ) : null}
        </k.V>
      ) : null;
    case "highlights":
      return (
        <k.V blockId={s.id} a="rise" wrap={false} stack style={{ flexDirection: "row", paddingHorizontal: P, marginTop: 20 }}>
          {s.items.map((item, index) => (
            <k.V key={item.id} a="rise" i={index} style={{ flex: 1, paddingLeft: index ? 20 : 0, paddingRight: 10, borderLeftWidth: index ? 0.6 : 0, borderLeftColor: c.line }}>
              <Icon k={k} name={highlightGlyph.bold[item.icon] ?? "performance"} size={26} color={m.accent} width={1.5} />
              <k.T edit={anchor(s.id, `items.${item.id}.title`)} style={{ fontSize: 13.5, fontWeight: 800, color: c.ink, marginTop: 9, letterSpacing: -0.3 }}>
                {item.title}
              </k.T>
              <k.T edit={anchor(s.id, `items.${item.id}.body`, "multiline")} style={{ ...t.small, fontSize: 10, marginTop: 3 }}>
                {item.body}
              </k.T>
            </k.V>
          ))}
        </k.V>
      );
    case "services":
      return light(<LineTable k={k} blockId={s.id} rows={s.rows} columns={servicesColumns(m, [21, 35, 7, 14, 8, 15])} {...table} rowStyle={{ paddingVertical: 7.5, paddingHorizontal: 8, alignItems: "center" }} />, { gap: 20 });
    case "options":
      return light(
        <k.V>
          {s.body ? <Paras k={k} text={s.body} edit={anchor(s.id, "body", "multiline")} style={{ ...t.small, marginBottom: 8 }} /> : null}
          <LineTable k={k} blockId={s.id} rows={s.rows} columns={optionsColumns(m, [26, 54, 20])} {...table} zebra={undefined} nameCell={{ ...table.nameCell }} rowStyle={{ paddingVertical: 7, paddingHorizontal: 8, alignItems: "center", borderBottomWidth: 0.5, borderBottomColor: c.line }} />
        </k.V>,
        { extra: "(non incluse nel totale)", gap: 20 },
      );
    case "summary":
      return <SummaryBand k={k} m={m} s={s} />;
    case "breakdown":
      return <BreakdownBand k={k} m={m} b={s} />;
    case "timeline": {
      const count = s.steps.length;
      return (
        <k.V blockId={s.id} wrap={false} a="rise" style={{ paddingHorizontal: P, paddingTop: 13 }}>
          <SectionHead k={k} m={m} no={s.no} title={s.heading} dark={false} edit={anchor(s.id, "heading")} />
          <k.Svg a="line" width={W - P * 2} height={14} viewBox={`0 0 ${W - P * 2} 14`}>
            <k.Line x1={6} y1={7} x2={6 + ((W - P * 2) / count) * (count - 1) + ((W - P * 2) / count - 40)} y2={7} stroke={c.ink} strokeWidth={1} />
            {s.steps.map((step, index) => {
              const x = index === count - 1 ? 6 + ((W - P * 2) / count) * index + ((W - P * 2) / count - 40) : 6 + ((W - P * 2) / count) * index;
              return <k.Circle key={step.id} cx={x} cy={7} r={4.6} fill={index === 0 ? m.accent : c.ink} />;
            })}
          </k.Svg>
          <k.V style={{ flexDirection: "row", marginTop: 6 }} stack>
            {s.steps.map((step) => (
              <k.V key={step.id} style={{ flex: 1, paddingRight: 8 }}>
                <k.T edit={anchor(s.id, `steps.${step.id}.label`)} style={{ fontSize: 10, fontWeight: 800, color: c.ink }}>
                  {step.label}
                </k.T>
                <k.T edit={anchor(s.id, `steps.${step.id}.title`)} style={{ ...t.small, marginTop: 2 }}>
                  {step.title}
                </k.T>
              </k.V>
            ))}
          </k.V>
        </k.V>
      );
    }
    case "terms":
      return dark(
        <k.V wrap={false} style={{ flexDirection: "row" }} stack>
          {s.columns.map((column, index) => (
            <k.V key={column.key} style={{ flex: column.key === "general" ? 1.4 : 1, flexDirection: "row", paddingLeft: index ? 14 : 0, marginLeft: index ? 8 : 0, borderLeftWidth: index ? 0.6 : 0, borderLeftColor: "#5A5A5A" }}>
              <Icon k={k} name={termIcons[column.key] ?? "document"} size={18} color={m.accent} width={1.6} />
              <k.V style={{ marginLeft: 11, flexGrow: 1, flexBasis: 0 }}>
                <k.T style={{ fontSize: 10, fontWeight: 800, color: c.white, marginBottom: 3 }}>{column.title}</k.T>
                <k.T edit={conditionAnchor(s.id, column)} style={{ ...t.small, fontSize: 9, color: c.onDark }}>
                  {column.body}
                </k.T>
              </k.V>
            </k.V>
          ))}
        </k.V>,
      );
    case "contacts":
      return dark(
        <k.V wrap={false} style={{ borderTopWidth: 0.6, borderTopColor: "#5A5A5A", paddingTop: 0 }}>
          {s.body ? <Paras k={k} text={s.body} edit={anchor(s.id, "body", "multiline")} style={{ ...t.small, color: c.onDark, marginBottom: 8 }} /> : null}
          <k.V style={{ flexDirection: "row" }} stack>
            {[m.issuer, m.client].map((party, index) => (
              <k.V key={index} style={{ flex: 1, paddingLeft: index ? 14 : 0, paddingRight: 8, borderLeftWidth: index ? 0.6 : 0, borderLeftColor: "#5A5A5A" }}>
                <k.T style={{ fontSize: 9.2, fontWeight: 800, color: c.white, marginBottom: 2 }}>{party.name}</k.T>
                {party.lines.map((line) => (
                  <k.T key={line.value} style={{ ...t.small, fontSize: 8.8, color: c.onDark }}>
                    {line.label ? <k.T style={{ fontWeight: 700, color: c.white }}>{`${line.label}  `}</k.T> : null}
                    {line.value}
                  </k.T>
                ))}
                {party.missing ? <k.T style={{ ...t.small, color: c.secondary }}>{party.missing}</k.T> : null}
              </k.V>
            ))}
            <k.V hover="box" style={{ width: "33%", backgroundColor: m.accent, borderRadius: 7, paddingVertical: 13, paddingHorizontal: 14, marginLeft: 8 }}>
              <k.T style={{ fontSize: 10, fontWeight: 800, color: m.onAccent }}>Per accettazione</k.T>
              {["Data", "Firma"].map((label) => (
                <k.V key={label} style={{ flexDirection: "row", alignItems: "flex-end", marginTop: 13 }}>
                  <k.T style={{ fontSize: 9.4, color: m.onAccent, width: 34 }}>{label}</k.T>
                  <k.V style={{ flexGrow: 1, borderBottomWidth: 0.7, borderBottomColor: m.onAccent, marginBottom: 2 }} />
                </k.V>
              ))}
            </k.V>
          </k.V>
        </k.V>,
      );
    default:
      return null;
  }
}

/** Bold gives the cost breakdown its own numbered section right after the timeline. */
function withBreakdown(m: DocModel, sections: Section[]): Item[] {
  const summary = sections.find((section): section is Extract<Section, { kind: "summary" }> => section.kind === "summary");
  if (!summary || !summary.breakdown || !m.breakdown.length) return sections;
  const anchor = sections.findIndex((section) => section.kind === "timeline");
  const at = (anchor >= 0 ? anchor : sections.indexOf(summary)) + 1;
  const no = sections[at - 1]?.no ? (sections[at - 1]?.no ?? 0) + 1 : 0;
  const shifted = sections.map((section, index) => (index >= at && section.no ? { ...section, no: section.no + 1 } : section));
  return [...shifted.slice(0, at), { kind: "breakdown", id: `${summary.id}-breakdown`, no, groups: summary.groups }, ...shifted.slice(at)];
}

export function renderBold(k: Kit, m: DocModel): ReactElement[] {
  const pages: ReactElement[] = [];
  if (m.cover) pages.push(<Cover key="cover" k={k} m={m} />);
  m.pages.forEach((sections, index) => {
    const items = withBreakdown(m, sections);
    const darkTop = items[0]?.kind === "summary";
    if (darkTop) {
      const [summary, ...rest] = items;
      pages.push(
        <k.Page key={`p${index}`} label={`Pagina ${index + 2}`} style={{ backgroundColor: c.paper, color: c.ink, fontFamily: sans }}>
          <k.V style={{ backgroundColor: c.ink }}>
            <Arc k={k} accent={m.accent} id={`bi-head-${index}`} width={W} height={300} cx={W + 250} cy={-124} r={433} fade={64} style={{ top: 0, left: 0 }} />
            <Header k={k} m={m} dark />
            {summary ? <Block k={k} m={m} s={summary} first last={false} /> : null}
          </k.V>
          {rest.map((section, position) => (
            <Block key={section.id} k={k} m={m} s={section} first={false} last={position === rest.length - 1} />
          ))}
          <Watermark k={k} m={m} style={{ color: c.secondary }} />
        </k.Page>,
      );
      return;
    }
    pages.push(
      <k.Page key={`p${index}`} label={`Pagina ${index + 2}`} style={{ backgroundColor: c.paper, color: c.ink, fontFamily: sans, paddingBottom: 34 }}>
        <Header k={k} m={m} dark={false} fixed />
        {items.map((section, position) => (
          <Block key={section.id} k={k} m={m} s={section} first={position === 0} last={false} />
        ))}
        <k.V fixed style={{ position: "absolute", right: 0, bottom: 0, width: 150, height: 46 }}>
          <k.Svg width={150} height={46} viewBox="0 0 200 60">
            <k.Path d="M0 60 200 0V60Z" fill={m.accent} />
          </k.Svg>
        </k.V>
        <Watermark k={k} m={m} style={{ color: c.secondary }} />
      </k.Page>,
    );
  });
  return pages;
}
