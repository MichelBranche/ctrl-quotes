import type { ReactElement } from "react";
import type { EditAnchor } from "@/domain/document-ops";
import { fonts, type Kit, type Style } from "../kit";
import { euro, fitTitle, mix, subtitleLines, titleLines, type DocModel, type MoneyGroup, type Section } from "../model";
import { chartPalette, chartType, ChartBody, type ChartTheme } from "./charts";
import { anchor, Brand, conditionAnchor, Icon, LineTable, optionsColumns, Paras, RowColumns, servicesColumns, Watermark } from "./shared";

/** Studio Editorial: warm white paper, uppercase tracked labels, soft boxes, stone arches on the cover. */

const c = {
  page: "#FAF9F7",
  ink: "#202020",
  muted: "#898989",
  soft: "#3A3A3A",
  box: "#F1EFED",
  rule: "#888888",
  light: "#D0CDCB",
};
const P = 37; // 13 mm
const sans = fonts.sans;

const t = {
  body: { fontSize: 10.6, lineHeight: 1.45, color: c.ink } as Style,
  small: { fontSize: 9.4, lineHeight: 1.4, color: c.soft } as Style,
  label: { fontSize: 8.2, fontWeight: 700, letterSpacing: 2.2, textTransform: "uppercase", color: c.ink } as Style,
};

const rule = (k: Kit, color = c.rule, width = 0.5) => <k.V style={{ borderTopWidth: width, borderTopColor: color }} />;

function Label({ k, children, extra, edit }: { k: Kit; children: string; extra?: string; edit?: EditAnchor }) {
  return (
    <k.T edit={edit} style={{ ...t.label, marginBottom: 10 }}>
      {children}
      {extra ? <k.T style={{ fontWeight: 500, fontSize: 7.4, color: c.soft }}>{`  ${extra}`}</k.T> : null}
    </k.T>
  );
}

function Header({ k, m }: { k: Kit; m: DocModel }) {
  return (
    <k.V fixed style={{ marginBottom: 18 }}>
      <k.V style={{ flexDirection: "row", alignItems: "center", paddingBottom: 16, borderBottomWidth: 0.5, borderBottomColor: c.rule }}>
        <k.V style={{ width: "44%" }}>
          <Brand k={k} m={m} dark={false} height={22} mark="studio" markColor={c.ink} gap={9} nameStyle={{ fontSize: 15, fontWeight: 500, color: c.ink, letterSpacing: -0.2 }} />
        </k.V>
        <k.V style={{ flexGrow: 1 }}>
          <k.T style={{ fontSize: 8.8, lineHeight: 1.35, color: c.soft }}>{`Preventivo · ${m.header.title}\nper ${m.header.client}`}</k.T>
        </k.V>
        <k.PageNo style={{ fontSize: 9, color: c.ink }} format={(page, total) => `${page} / ${total}`} />
      </k.V>
    </k.V>
  );
}

function Cover({ k, m }: { k: Kit; m: DocModel }) {
  const cover = m.cover;
  if (!cover) return null;
  const size = fitTitle(cover.title, 62, 40);
  const meta = [
    { label: "N. Preventivo", value: cover.number },
    { label: "Data", value: cover.date },
    ...(cover.validity ? [{ label: "Validità", value: cover.validity }] : []),
  ];
  const accent = m.accent;
  return (
    <k.Page cover label="Copertina" style={{ backgroundColor: c.page, color: c.ink, fontFamily: sans }}>
      <Watermark k={k} m={m} style={{ color: c.muted }} />
      {cover.coverPhoto ? (
        <k.V a="fade" style={{ position: "absolute", left: 0, right: 0, bottom: 142, height: 318 }}>
          <k.Img src={cover.coverPhoto} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        </k.V>
      ) : (
        <Arches k={k} accent={accent} />
      )}
      <k.V blockId={cover.id ?? undefined} style={{ paddingHorizontal: P + 5, paddingTop: 46, flexGrow: 1 }}>
        <k.V style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" }} a="fade">
          <Brand k={k} m={m} dark={false} height={40} mark="studio" markColor={c.ink} gap={14} maxWidth={200} nameStyle={{ fontSize: 22, fontWeight: 500, lineHeight: 1.05, letterSpacing: -0.4, color: c.ink, maxWidth: 130 }} />
          {m.issuer.tagline ? (
            <k.T edit={anchor(cover.id, "tagline")} style={{ fontSize: 9.2, lineHeight: 1.45, color: c.ink, maxWidth: 120 }}>
              {m.issuer.tagline}
            </k.T>
          ) : null}
        </k.V>
        <k.T style={{ ...t.label, fontSize: 10.4, letterSpacing: 2.6, fontWeight: 600, marginTop: 80 }}>Preventivo commerciale</k.T>
        <k.T a="rise" edit={anchor(cover.id, "title")} style={{ fontSize: size, fontWeight: 700, lineHeight: 0.98, letterSpacing: -size * 0.035, color: c.ink, marginTop: 20, maxWidth: "60%" }}>
          {titleLines(cover.title)}
        </k.T>
        {cover.subtitle ? (
          <k.T a="fade" i={2} edit={anchor(cover.id, "subtitle", "multiline")} style={{ fontSize: 35, fontWeight: 500, lineHeight: 1.12, letterSpacing: -0.8, color: c.muted, marginTop: 16, maxWidth: "80%" }}>
            {subtitleLines(cover.subtitle)}
          </k.T>
        ) : null}
      </k.V>
      <k.V style={{ height: 142, backgroundColor: c.page, paddingHorizontal: P + 5, paddingTop: 30 }}>
        <k.V style={{ width: 26, borderTopWidth: 1.6, borderTopColor: c.ink }} />
        <k.V style={{ flexDirection: "row", marginTop: 26 }} stack>
          {meta.map((item, index) => (
            <k.V key={item.label} style={{ flex: index === 0 ? 0.9 : 1, paddingLeft: index ? 16 : 0, borderLeftWidth: index ? 0.5 : 0, borderLeftColor: c.rule }}>
              <k.T style={{ fontSize: 7.4, fontWeight: 700, letterSpacing: 1.3, textTransform: "uppercase", color: c.ink }}>{item.label}</k.T>
              <k.T style={{ fontSize: 10.6, color: c.ink, marginTop: 6 }}>{item.value}</k.T>
            </k.V>
          ))}
        </k.V>
      </k.V>
    </k.Page>
  );
}

/** Vector fallback of the arches, recoloured with the accent (used when no photo is shipped or chosen). */
function Arches({ k, accent }: { k: Kit; accent: string }) {
  return (
    <k.Svg width={595.28} height={340} viewBox="0 0 1600 914" preserveAspectRatio="xMidYMid slice" style={{ position: "absolute", left: 0, bottom: 142 }} a="fade">
      <k.Defs>
        <k.LinearGradient id="se-stone" x1="0" y1="0" x2="1" y2="1">
          <k.Stop offset="0" stopColor="#ECE9E5" />
          <k.Stop offset="1" stopColor="#C9C4BF" />
        </k.LinearGradient>
      </k.Defs>
      <k.Path d="M0 520 C420 330 1110 300 1600 0 L1600 914 H0Z" fill="url(#se-stone)" />
      <k.Path d="M300 914 C440 420 800 250 1600 400 L1600 914Z" fill="#A9A29C" />
      <k.Path d="M760 914 C950 620 1200 500 1600 520 L1600 914Z" fill={accent} />
    </k.Svg>
  );
}

function Money({ k, g, tint }: { k: Kit; g: MoneyGroup; tint: string }) {
  return (
    <k.V wrap={false} hover="box" stack style={{ flexDirection: "row", backgroundColor: tint, borderRadius: 4, paddingVertical: 11, paddingHorizontal: 18, marginBottom: 9 }}>
      <k.V style={{ width: "42%", paddingTop: 6 }}>
        <k.T style={{ fontSize: 13.6, fontWeight: 600, color: c.ink, letterSpacing: -0.2 }}>{g.title}</k.T>
        {g.caption ? <k.T style={{ ...t.small, marginTop: 2 }}>{`(${g.caption.toLowerCase()})`}</k.T> : null}
      </k.V>
      <k.V style={{ flexGrow: 1, flexBasis: 0 }}>
        {g.rows.map((row) => (
          <k.V key={row.label} style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
            <k.T style={t.small}>{row.label}</k.T>
            <k.T style={t.small}>{row.value}</k.T>
          </k.V>
        ))}
        <k.V style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", borderTopWidth: 0.5, borderTopColor: c.light, paddingTop: 8, marginTop: 4 }}>
          <k.T style={{ fontSize: 12, fontWeight: 600, color: c.ink }}>Totale</k.T>
          <k.Amount a="fade" cents={g.totalCents} text={g.total} format={euro} style={{ fontSize: 16.5, fontWeight: 700, color: c.ink, letterSpacing: -0.2 }} />
        </k.V>
      </k.V>
    </k.V>
  );
}

function tintOf(accent: string): string {
  // The monthly box: a pale wash of the accent, like #E8ECF2 for the default blue.
  const raw = accent.replace("#", "");
  const mixChannel = (offset: number) => Math.round(Number.parseInt(raw.slice(offset, offset + 2), 16) * 0.22 + 250 * 0.78);
  return `rgb(${mixChannel(0)}, ${mixChannel(2)}, ${mixChannel(4)})`;
}

const icons: Record<string, string> = { payment: "payment", validity: "calendar", notes: "notes", general: "document" };

/** `col`: width in percent when the section is a column of a row (the row draws the rule and the gap). */
function Block({ k, m, s, first, col }: { k: Kit; m: DocModel; s: Section; first: boolean; col?: number }): ReactElement | null {
  const narrow = col !== undefined && col <= 55;
  const frame = (children: ReactElement, gap: number, keep: boolean, blockId?: string) => (
    <k.V blockId={blockId} a={blockId ? "rise" : undefined} keep={keep || undefined} style={{ marginTop: first ? 0 : gap }}>
      {first ? null : rule(k)}
      <k.V style={{ paddingTop: first ? 0 : 15 }}>{children}</k.V>
    </k.V>
  );
  const wrap = (children: ReactElement, gap = 17, keep = false) =>
    col !== undefined ? (
      <k.V blockId={s.id} a="rise">
        {children}
      </k.V>
    ) : (
      frame(children, gap, keep, s.id)
    );
  switch (s.kind) {
    case "row":
      return frame(<RowColumns k={k} s={s} gap={22} render={(section, width) => <Block k={k} m={m} s={section} first col={width} />} />, 17, true);
    case "intro":
      return wrap(
        <k.V stack style={{ flexDirection: "row", paddingBottom: 6 }}>
          <k.V style={{ width: "38%" }}>
            <k.T style={{ ...t.label, marginBottom: 6 }}>Introduzione</k.T>
            <k.T edit={anchor(s.id, "heading")} style={{ fontSize: 24, fontWeight: 600, letterSpacing: -0.7, color: c.ink }}>
              {s.heading}
            </k.T>
          </k.V>
          <k.V style={{ flexGrow: 1, flexBasis: 0 }}>
            {s.lead ? <k.T edit={anchor(s.id, "lead", "multiline")} style={{ fontSize: 12.5, fontWeight: 600, lineHeight: 1.3, color: c.ink, marginBottom: 8 }}>{s.lead}</k.T> : null}
            <Paras k={k} edit={anchor(s.id, "body", "multiline")} text={s.body || "Descrivi qui il progetto e gli obiettivi del cliente."} style={{ ...t.body, color: s.body ? c.ink : c.muted }} />
            {s.points.length ? (
              <k.V style={{ marginTop: 14 }}>
                <k.T style={{ fontSize: 10.6, fontWeight: 700, color: c.ink, marginBottom: 5 }}>Obiettivi principali:</k.T>
                {s.points.map((point, index) => (
                  <k.V key={index} style={{ flexDirection: "row", marginBottom: 2 }}>
                    <k.T style={{ ...t.small, color: c.ink, width: 12 }}>•</k.T>
                    <k.T edit={anchor(s.id, `points.${s.pointIndexes[index] ?? index}`)} style={{ ...t.small, color: c.ink, flexGrow: 1, flexBasis: 0 }}>
                      {point}
                    </k.T>
                  </k.V>
                ))}
              </k.V>
            ) : null}
            {s.quote ? <k.T edit={anchor(s.id, "quote", "multiline")} style={{ fontSize: 13, fontWeight: 500, lineHeight: 1.35, color: c.ink, marginTop: 12 }}>{`“${s.quote}”`}</k.T> : null}
          </k.V>
        </k.V>,
      );
    case "text":
      return wrap(
        <k.V>
          {s.heading ? <Label k={k} edit={anchor(s.id, "heading")}>{s.heading}</Label> : null}
          <Paras k={k} text={s.body} edit={anchor(s.id, "body", "multiline")} style={t.body} />
        </k.V>,
      );
    case "image":
      return s.src ? (
        <k.V blockId={s.id} a="fade" style={{ marginTop: col !== undefined ? 0 : 22 }} wrap={false}>
          <k.Img src={s.src} alt={s.alt} style={{ width: "100%", height: col !== undefined ? 170 : 220, objectFit: "cover", borderRadius: 4 }} />
          {s.caption ? (
            <k.T edit={anchor(s.id, "caption")} style={{ ...t.small, marginTop: 6, color: c.muted }}>
              {s.caption}
            </k.T>
          ) : null}
        </k.V>
      ) : null;
    case "highlights":
      return wrap(
        <k.V>
          <Label k={k} edit={anchor(s.id, "heading")}>{s.heading}</Label>
          <k.V stack style={{ flexDirection: narrow ? "column" : "row" }}>
            {s.items.map((item, index) => (
              <k.V
                key={item.id}
                a="rise"
                i={index}
                style={
                  narrow
                    ? { paddingTop: index ? 8 : 0, marginTop: index ? 8 : 0, borderTopWidth: index ? 0.5 : 0, borderTopColor: c.light }
                    : { flex: 1, paddingLeft: index ? 14 : 0, marginLeft: index ? 8 : 0, borderLeftWidth: index ? 0.5 : 0, borderLeftColor: c.light }
                }
              >
                <k.T edit={anchor(s.id, `items.${item.id}.title`)} style={{ fontSize: 10.6, fontWeight: 700, color: c.ink }}>
                  {item.title}
                </k.T>
                <k.T edit={anchor(s.id, `items.${item.id}.body`, "multiline")} style={{ ...t.small, marginTop: 3 }}>
                  {item.body}
                </k.T>
              </k.V>
            ))}
          </k.V>
        </k.V>,
      );
    case "services":
    case "options": {
      const options = s.kind === "options";
      const columns = options ? optionsColumns(m, [28, 51, 21]) : servicesColumns(m, [21, 34, 6, 15, 9, 15]);
      return wrap(
        <k.V>
          <Label k={k} edit={anchor(s.id, "heading")} extra={options ? "(NON INCLUSE NEL TOTALE)" : undefined}>
            {s.heading}
          </Label>
          {options && s.body ? <Paras k={k} text={s.body} edit={anchor(s.id, "body", "multiline")} style={{ ...t.small, marginBottom: 8 }} /> : null}
          <LineTable
            k={k}
            blockId={s.id}
            rows={s.rows}
            columns={columns}
            head={{ backgroundColor: c.box, borderRadius: 3, paddingVertical: 8, paddingHorizontal: 6 }}
            headText={{ fontSize: 8.6, fontWeight: 600, color: c.ink }}
            rowStyle={{ paddingVertical: options ? 7.5 : 6.5, paddingHorizontal: 6, borderBottomWidth: 0.4, borderBottomColor: c.light, alignItems: "center" }}
            nameCell={{ fontSize: 9.4, fontWeight: 600, color: c.ink, lineHeight: 1.3 }}
            cell={{ fontSize: 8.8, color: c.ink, lineHeight: 1.36 }}
            empty={{ ...t.small, color: c.muted }}
          />
        </k.V>,
        options ? 20 : 17,
      );
    }
    case "summary":
      return wrap(
        <k.V>
          <Label k={k} edit={anchor(s.id, "heading")}>{s.heading}</Label>
          {s.groups.map((group) => (
            <Money key={group.key} k={k} g={group} tint={group.key === "oneTime" ? c.box : tintOf(m.accent)} />
          ))}
          {s.notices.map((notice) => (
            <k.T key={notice} style={{ ...t.small, color: c.muted, marginTop: 4 }}>
              {notice}
            </k.T>
          ))}
          {s.body ? <Paras k={k} text={s.body} edit={anchor(s.id, "body", "multiline")} style={{ ...t.small, marginTop: 6 }} /> : null}
        </k.V>,
      );
    case "timeline":
      return wrap(
        <k.V wrap={false}>
          <Label k={k} edit={anchor(s.id, "heading")}>{s.heading}</Label>
          <k.V style={{ flexDirection: "row", paddingHorizontal: 6 }} stack>
            {s.steps.map((step) => (
              <k.V key={step.id} style={{ flex: 1, paddingRight: 8 }}>
                <k.T edit={anchor(s.id, `steps.${step.id}.label`)} style={{ fontSize: 9.2, fontWeight: 600, color: c.ink }}>
                  {step.label}
                </k.T>
                <k.T edit={anchor(s.id, `steps.${step.id}.title`)} style={{ ...t.small, color: c.ink, marginTop: 2 }}>
                  {step.title}
                </k.T>
              </k.V>
            ))}
          </k.V>
          <Track k={k} count={s.steps.length} width={521} />
        </k.V>,
        14,
      );
    case "terms":
      return wrap(
        <k.V wrap={false}>
          <Label k={k} edit={anchor(s.id, "heading")}>{s.heading}</Label>
          <k.V style={{ flexDirection: col !== undefined ? "column" : "row" }} stack>
            {s.columns.map((column, index) => (
              <k.V
                key={column.key}
                style={
                  col !== undefined
                    ? { marginTop: index ? 12 : 0 }
                    : { flex: column.key === "general" ? 1.4 : 1, paddingLeft: index ? 14 : 0, marginLeft: index ? 8 : 0, borderLeftWidth: index ? 0.5 : 0, borderLeftColor: c.rule }
                }
              >
                <k.V style={{ flexDirection: "row", alignItems: "center", marginBottom: 7 }}>
                  <Icon k={k} name={icons[column.key] ?? "notes"} size={11} color={c.ink} width={1.6} />
                  <k.T style={{ fontSize: 9.8, fontWeight: 600, color: c.ink, marginLeft: 7 }}>{column.title}</k.T>
                </k.V>
                <k.T edit={conditionAnchor(s.id, column)} style={{ ...t.small, color: c.ink }}>
                  {column.body}
                </k.T>
              </k.V>
            ))}
          </k.V>
        </k.V>,
        14,
      );
    case "contacts":
      return wrap(
        <k.V wrap={false}>
          <Label k={k} edit={anchor(s.id, "heading")}>{s.heading}</Label>
          {s.body ? <Paras k={k} text={s.body} edit={anchor(s.id, "body", "multiline")} style={{ ...t.small, marginBottom: 8 }} /> : null}
          <k.V style={{ flexDirection: "row" }} stack>
            {[m.issuer, m.client].map((party, index) => (
              <k.V key={index} style={{ flex: 1, paddingLeft: index ? 40 : 0, borderLeftWidth: index ? 0.5 : 0, borderLeftColor: c.rule, marginLeft: index ? 0 : 0 }}>
                <k.T style={{ fontSize: 11, fontWeight: 600, color: c.ink, marginBottom: 4 }}>{party.name}</k.T>
                {party.lines.map((line) => (
                  <k.T key={line.value} style={{ ...t.small, color: c.ink }}>
                    {line.label ? <k.T style={{ fontWeight: 700 }}>{`${line.label}  `}</k.T> : null}
                    {line.value}
                  </k.T>
                ))}
                {party.missing ? <k.T style={{ ...t.small, color: c.muted }}>{party.missing}</k.T> : null}
              </k.V>
            ))}
          </k.V>
          <k.V hover="box" style={{ marginTop: 14, backgroundColor: c.box, borderRadius: 4, paddingVertical: 12, paddingHorizontal: 20, flexDirection: "row" }} stack>
            <k.V style={{ flex: 1 }}>
              <k.T style={{ fontSize: 9.4, fontWeight: 600, color: c.ink }}>Per accettazione</k.T>
              <k.V style={{ flexDirection: "row", alignItems: "flex-end", marginTop: 16 }}>
                <k.T style={{ ...t.small, color: c.ink, marginRight: 6 }}>Data</k.T>
                <k.V style={{ width: 110, borderBottomWidth: 0.6, borderBottomColor: c.ink, marginBottom: 3 }} />
              </k.V>
            </k.V>
            <k.V style={{ flex: 1 }}>
              <k.T style={{ ...t.small, color: c.ink }}>{`Firma (${m.client.name})`}</k.T>
              <k.V style={{ borderBottomWidth: 0.6, borderBottomColor: c.ink, marginTop: 26, marginRight: 30 }} />
            </k.V>
          </k.V>
        </k.V>,
        14,
      );
    case "chart":
      return wrap(
        <k.V>
          <Label k={k} edit={anchor(s.id, "heading")}>{s.heading}</Label>
          <ChartBody k={k} m={m} s={s} theme={studioChart(m)} width={col} />
        </k.V>,
        17,
        true,
      );
    default:
      return null;
  }
}

function studioChart(m: DocModel): ChartTheme {
  return {
    page: c.box,
    ink: c.ink,
    soft: c.soft,
    muted: c.muted,
    rule: c.light,
    track: "#E4E1DE",
    palette: chartPalette(mix(m.accent, c.ink, 0.25), c.ink, c.page),
    ...chartType(sans, c.ink, c.muted),
    card: { backgroundColor: c.box, borderRadius: 4, paddingVertical: 16, paddingHorizontal: 18 },
    radius: 6,
  };
}

function Track({ k, count, width }: { k: Kit; count: number; width: number }) {
  const nodes = Array.from({ length: count }, (_, index) => 10 + (width / count) * index);
  const last = nodes[nodes.length - 1] ?? 10;
  return (
    <k.Svg width={width} height={20} viewBox={`0 0 ${width} 20`} style={{ marginTop: 14 }} a="line">
      <k.Line x1={10} y1={10} x2={last} y2={10} stroke={c.ink} strokeWidth={0.9} />
      {nodes.map((x, index) => (
        <k.Circle key={index} cx={x} cy={10} r={4.6} fill={index === count - 1 ? c.ink : c.page} stroke={c.ink} strokeWidth={0.9} />
      ))}
    </k.Svg>
  );
}

export function renderStudio(k: Kit, m: DocModel): ReactElement[] {
  const pages: ReactElement[] = [];
  if (m.cover) pages.push(<Cover key="cover" k={k} m={m} />);
  m.pages.forEach((sections, index) => {
    pages.push(
      <k.Page key={`p${index}`} label={`Pagina ${index + 2}`} style={{ backgroundColor: c.page, color: c.ink, fontFamily: sans, paddingHorizontal: P, paddingTop: 36, paddingBottom: 36 }}>
        <Watermark k={k} m={m} style={{ color: c.muted }} />
        <Header k={k} m={m} />
        {sections.map((section, position) => (
          <Block key={section.id} k={k} m={m} s={section} first={position === 0} />
        ))}
      </k.Page>,
    );
  });
  return pages;
}
