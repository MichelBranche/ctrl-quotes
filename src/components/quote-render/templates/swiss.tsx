import type { ReactElement } from "react";
import { fonts, type Kit, type Style } from "../kit";
import { euro, fitTitle, subtitleLines, titleLines, type DocModel, type MoneyGroup, type Section, mayBreak } from "../model";
import { chartPalette, chartType, ChartBody, type ChartTheme } from "./charts";
import { AcceptanceValue, anchor, Brand, conditionAnchor, LineTable, optionsColumns, pad, Paras, RowColumns, servicesColumns, Watermark } from "./shared";

/** Swiss Minimal: typographic, white, numbered 01 to 08, one accent dot. Measured on the reference mockup. */

const c = {
  page: "#FFFFFF",
  ink: "#101010",
  soft: "#303030",
  muted: "#929292",
  rule: "#444444",
  light: "#A5A5A5",
};
const P = 31; // 11 mm
const sans = fonts.sans;

const t = {
  body: { fontSize: 11.2, lineHeight: 1.42, color: c.soft } as Style,
  small: { fontSize: 9.6, lineHeight: 1.38, color: c.soft } as Style,
  label: { fontSize: 9.6, color: c.ink } as Style,
  sectionNo: { fontSize: 9.4, color: c.ink, width: 30 } as Style,
  sectionTitle: { fontSize: 11.2, fontWeight: 600, color: c.ink, letterSpacing: -0.1 } as Style,
};

/** `label` prints a fixed title instead of the stored heading (and is not editable). */
function SectionHead({ k, s, extra, label }: { k: Kit; s: Section; extra?: string; label?: string }) {
  return (
    <k.V style={{ flexDirection: "row", alignItems: "baseline", marginBottom: 12 }}>
      <k.T style={t.sectionNo}>{pad(s.no)}</k.T>
      <k.T edit={label === undefined && "heading" in s ? anchor(s.id, "heading") : undefined} style={t.sectionTitle}>
        {label ?? ("heading" in s ? s.heading : "")}
        {extra ? <k.T style={{ fontWeight: 400, color: c.soft }}>{` ${extra}`}</k.T> : null}
      </k.T>
    </k.V>
  );
}

const rule = (k: Kit, color = c.rule, width = 0.6, margin = 0) => <k.V style={{ borderTopWidth: width, borderTopColor: color, marginVertical: margin }} />;

function Header({ k, m }: { k: Kit; m: DocModel }) {
  return (
    <k.V fixed style={{ marginBottom: 22 }}>
      <k.V style={{ flexDirection: "row", alignItems: "flex-start", paddingBottom: 22, borderBottomWidth: 0.6, borderBottomColor: c.rule }}>
        <k.V style={{ width: "46%" }}>
          <Brand k={k} m={m} dark={false} height={18} nameStyle={{ fontSize: 16, fontWeight: 600, color: c.ink, letterSpacing: -0.3 }} />
        </k.V>
        <k.V style={{ flexGrow: 1 }}>
          <k.T style={{ fontSize: 9.6, lineHeight: 1.35, color: c.soft }}>{`Preventivo · ${m.header.title}\nper ${m.header.client}`}</k.T>
        </k.V>
        <k.PageNo style={{ fontSize: 9.6, color: c.ink, fontWeight: 500 }} format={(page, total) => `${pad(page)} / ${pad(total)}`} />
      </k.V>
    </k.V>
  );
}

function Cover({ k, m }: { k: Kit; m: DocModel }) {
  const cover = m.cover;
  if (!cover) return null;
  const size = fitTitle(cover.title, 94, 60);
  const meta = [
    { label: "N. Preventivo", value: cover.number },
    { label: "Data", value: cover.dateShort },
    ...(cover.validityShort ? [{ label: "Validità", value: cover.validityShort }] : []),
  ];
  return (
    <k.Page cover label="Copertina" style={{ backgroundColor: c.page, color: c.ink, fontFamily: sans, paddingHorizontal: P, paddingTop: 34, paddingBottom: 30 }}>
      <Watermark k={k} m={m} style={{ color: c.muted }} />
      <k.V blockId={cover.id ?? undefined} style={{ flexGrow: 1 }}>
        <k.V style={{ flexDirection: "row", alignItems: "flex-start" }} a="fade">
          <k.V style={{ width: "47%" }}>
            <Brand k={k} m={m} dark={false} height={22} nameStyle={{ fontSize: 15.5, fontWeight: 600, letterSpacing: -0.3 }} />
          </k.V>
          <k.V style={{ flexGrow: 1 }}>{m.issuer.tagline ? (
              <k.T edit={anchor(cover.id, "tagline")} style={{ fontSize: 9.6, lineHeight: 1.4, color: c.soft }}>
                {m.issuer.tagline}
              </k.T>
            ) : null}</k.V>
          <k.V style={{ width: 11, height: 11, borderRadius: 6, backgroundColor: m.accent, marginTop: 2 }} />
        </k.V>
        <k.V style={{ flexGrow: 1 }} />
        <k.V>
          <k.T style={{ fontSize: 9.6, color: c.ink }}>01</k.T>
          <k.T style={{ fontSize: 14, color: c.ink, marginTop: 3 }}>Preventivo commerciale</k.T>
          {rule(k, c.rule, 0.6, 12)}
          <k.T a="rise" edit={anchor(cover.id, "title")} style={{ fontSize: size, fontWeight: 300, lineHeight: 0.98, letterSpacing: -size * 0.03, color: c.ink, maxWidth: "74%", marginTop: 8 }}>
            {titleLines(cover.title)}
          </k.T>
          {cover.subtitle ? (
            <k.T a="fade" i={2} edit={anchor(cover.id, "subtitle", "multiline")} style={{ fontSize: 33, fontWeight: 300, lineHeight: 1.06, letterSpacing: -0.9, color: c.muted, marginTop: 12 }}>
              {subtitleLines(cover.subtitle)}
            </k.T>
          ) : null}
        </k.V>
        <k.V style={{ height: 36 }} />
        {rule(k, c.rule, 0.6)}
        <k.V style={{ flexDirection: "row", paddingTop: 12 }} stack>
          {meta.map((item, index) => (
            <k.V key={item.label} style={{ flex: 1, paddingLeft: index ? 14 : 0, borderLeftWidth: index ? 0.6 : 0, borderLeftColor: c.rule, marginLeft: index ? 6 : 0 }}>
              <k.T style={{ fontSize: 9.6, color: c.soft }}>{item.label}</k.T>
              <k.T style={{ fontSize: 11, color: c.ink, marginTop: 3 }}>{item.value}</k.T>
            </k.V>
          ))}
        </k.V>
      </k.V>
    </k.Page>
  );
}

function Money({ k, g }: { k: Kit; g: MoneyGroup }) {
  return (
    <k.V wrap={false} stack style={{ flexDirection: "row", paddingVertical: 12, borderBottomWidth: 0.6, borderBottomColor: c.rule }}>
      <k.V style={{ width: "50%", paddingTop: 2 }}>
        <k.T style={{ fontSize: 15, fontWeight: 600, color: c.ink, letterSpacing: -0.2 }}>{g.title}</k.T>
        {g.caption ? <k.T style={{ ...t.small, marginTop: 3 }}>{`(${g.caption})`}</k.T> : null}
      </k.V>
      <k.V style={{ flexGrow: 1 }}>
        {g.rows.map((row) => (
          <k.V key={row.label} style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
            <k.T style={t.small}>{row.label}</k.T>
            <k.T style={t.small}>{row.value}</k.T>
          </k.V>
        ))}
        <k.V style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", borderTopWidth: 0.5, borderTopColor: c.rule, paddingTop: 7, marginTop: 3 }}>
          <k.T style={{ fontSize: 12.5, fontWeight: 600, color: c.ink }}>Totale</k.T>
          <k.Amount a="fade" cents={g.totalCents} text={g.total} format={euro} style={{ fontSize: 17.5, fontWeight: 700, color: c.ink, letterSpacing: -0.2 }} />
        </k.V>
      </k.V>
    </k.V>
  );
}

/** `col`: width in percent when the section is a column of a row (the row draws the rule and the gap). */
function Block({ k, m, s, first, col }: { k: Kit; m: DocModel; s: Section; first: boolean; col?: number }): ReactElement | null {
  const top = first ? null : rule(k, c.rule, 0.6);
  const narrow = col !== undefined && col <= 55;
  // `keep` stays whole on one PDF page unless the pagination pass found it taller than a page.
  const frame = (children: ReactElement, gap: number, keep: boolean, blockId?: string) => (
    <k.V
      blockId={blockId}
      printId={blockId ? undefined : s.id}
      a={blockId ? "rise" : undefined}
      keep={(keep && !mayBreak(m.print, s.id)) || undefined}
      breakBefore={m.print.fresh.has(s.id) || undefined}
      style={{ marginTop: first ? 0 : gap }}
    >
      {top}
      <k.V style={{ paddingTop: first ? 0 : 18 }}>{children}</k.V>
    </k.V>
  );
  const wrap = (children: ReactElement, gap = 26, keep = false) =>
    col !== undefined ? (
      <k.V blockId={s.id} a="rise">
        {children}
      </k.V>
    ) : (
      frame(children, gap, keep, s.id)
    );
  switch (s.kind) {
    case "row":
      return frame(<RowColumns k={k} s={s} gap={26} render={(section, width) => <Block k={k} m={m} s={section} first col={width} />} />, 26, true);
    case "intro":
      return wrap(
        <k.V>
          <SectionHead k={k} s={s} label="Introduzione" />
          <k.V stack style={{ flexDirection: "row", marginTop: 4 }}>
            <k.V style={{ width: "46%" }}>
              <k.T edit={anchor(s.id, "heading")} style={{ fontSize: 32, fontWeight: 300, letterSpacing: -1, lineHeight: 1.08, color: c.ink, marginTop: 6 }}>
                {s.heading}
              </k.T>
            </k.V>
            <k.V style={{ flexGrow: 1, flexBasis: 0 }}>
              {s.lead ? <k.T edit={anchor(s.id, "lead", "multiline")} style={{ fontSize: 13, fontWeight: 500, lineHeight: 1.3, color: c.ink, marginBottom: 8 }}>{s.lead}</k.T> : null}
              <Paras k={k} edit={anchor(s.id, "body", "multiline")} text={s.body || "Descrivi qui il progetto e gli obiettivi del cliente."} style={{ ...t.body, color: s.body ? c.soft : c.muted }} />
              {s.points.length ? (
                <k.V style={{ marginTop: 6 }}>
                  {s.points.map((point, index) => (
                    <k.T key={index} edit={anchor(s.id, `points.${s.pointIndexes[index] ?? index}`)} style={t.body}>{`•  ${point}`}</k.T>
                  ))}
                </k.V>
              ) : null}
            </k.V>
          </k.V>
          {s.quote ? <k.T edit={anchor(s.id, "quote", "multiline")} style={{ fontSize: 15, fontWeight: 300, lineHeight: 1.3, color: c.ink, marginTop: 16, maxWidth: "80%" }}>{`“${s.quote}”`}</k.T> : null}
          <k.V style={{ height: 18 }} />
        </k.V>,
      );
    case "text":
      return wrap(
        <k.V>
          {s.heading ? <SectionHead k={k} s={s} /> : null}
          <Paras k={k} text={s.body} edit={anchor(s.id, "body", "multiline")} style={t.body} />
        </k.V>,
      );
    case "image":
      return s.src ? (
        <k.V blockId={s.id} a="fade" style={{ marginTop: col !== undefined ? 0 : 22 }} wrap={false}>
          <k.Img src={s.src} alt={s.alt} style={{ width: "100%", height: col !== undefined ? 170 : 220, objectFit: "cover" }} />
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
          <SectionHead k={k} s={s} />
          <k.V stack style={{ flexDirection: narrow ? "column" : "row" }}>
            {s.items.map((item, index) => (
              <k.V
                key={item.id}
                a="rise"
                i={index}
                style={
                  narrow
                    ? { paddingTop: index ? 8 : 0, marginTop: index ? 8 : 0, borderTopWidth: index ? 0.4 : 0, borderTopColor: c.light }
                    : { flex: 1, paddingLeft: index ? 12 : 0, marginLeft: index ? 8 : 0, borderLeftWidth: index ? 0.4 : 0, borderLeftColor: c.light }
                }
              >
                <k.T edit={anchor(s.id, `items.${item.id}.title`)} style={{ fontSize: 10, fontWeight: 600, color: c.ink }}>
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
      const columns = options ? optionsColumns(m, [29, 50, 21]) : servicesColumns(m, [21, 35, 7, 14, 8, 15]);
      return wrap(
        <k.V>
          <SectionHead k={k} s={s} extra={options ? "(non incluse nel totale)" : undefined} />
          {options && s.body ? <Paras k={k} text={s.body} edit={anchor(s.id, "body", "multiline")} style={{ ...t.small, marginBottom: 8 }} /> : null}
          <LineTable
            k={k}
            blockId={s.id}
            rows={s.rows}
            columns={columns}
            head={{ paddingBottom: 9, borderBottomWidth: 0.6, borderBottomColor: c.rule }}
            headText={{ fontSize: 9, fontWeight: 600, color: c.ink }}
            rowStyle={{ paddingVertical: options ? 8 : 9.5, borderBottomWidth: 0.4, borderBottomColor: c.light, alignItems: "center" }}
            nameCell={{ fontSize: 9.6, fontWeight: 600, color: c.ink, lineHeight: 1.3 }}
            cell={{ fontSize: 9, color: c.soft, lineHeight: 1.36 }}
            empty={{ ...t.small, color: c.muted }}
          />
        </k.V>,
        options ? 30 : 26,
      );
    }
    case "summary":
      return wrap(
        <k.V>
          <SectionHead k={k} s={s} />
          {s.groups.map((group, index) => (
            <k.V key={group.key} style={{ borderTopWidth: index ? 0 : 0, marginTop: index ? 0 : -6 }}>
              <Money k={k} g={group} />
            </k.V>
          ))}
          {s.notices.map((notice) => (
            <k.T key={notice} style={{ ...t.small, color: c.muted, marginTop: 6 }}>
              {notice}
            </k.T>
          ))}
          {s.body ? <Paras k={k} text={s.body} edit={anchor(s.id, "body", "multiline")} style={{ ...t.small, marginTop: 8 }} /> : null}
        </k.V>,
      );
    case "timeline":
      return wrap(
        <k.V wrap={false}>
          <SectionHead k={k} s={s} />
          <k.V style={{ flexDirection: "row" }} stack>
            {s.steps.map((step) => (
              <k.V key={step.id} style={{ flex: 1, paddingRight: 8 }}>
                <k.T edit={anchor(s.id, `steps.${step.id}.label`)} style={{ fontSize: 9.6, fontWeight: 600, color: c.ink }}>
                  {step.label}
                </k.T>
                <k.T edit={anchor(s.id, `steps.${step.id}.title`)} style={{ ...t.small, marginTop: 2 }}>
                  {step.title}
                </k.T>
              </k.V>
            ))}
          </k.V>
          <Track k={k} m={m} count={s.steps.length} />
        </k.V>,
        14,
      );
    case "terms":
      return wrap(
        <k.V>
          <SectionHead k={k} s={s} />
          <k.V style={{ flexDirection: col !== undefined ? "column" : "row" }} stack>
            {s.columns.map((column, index) => (
              <k.V
                key={column.key}
                style={
                  col !== undefined
                    ? { marginTop: index ? 10 : 0 }
                    : { flex: column.key === "general" ? 1.4 : 1, paddingLeft: index ? 12 : 0, marginLeft: index ? 8 : 0, borderLeftWidth: index ? 0.6 : 0, borderLeftColor: c.rule }
                }
              >
                <k.T style={{ fontSize: 9.8, fontWeight: 600, color: c.ink }}>{column.title}</k.T>
                <k.T edit={conditionAnchor(s.id, column)} style={{ ...t.small, marginTop: 5 }}>
                  {column.body}
                </k.T>
              </k.V>
            ))}
          </k.V>
        </k.V>,
        14,
        true,
      );
    case "contacts":
      return wrap(
        <k.V>
          <SectionHead k={k} s={s} />
          {s.body ? <Paras k={k} text={s.body} edit={anchor(s.id, "body", "multiline")} style={{ ...t.small, marginBottom: 8 }} /> : null}
          <k.V style={{ flexDirection: "row" }} stack>
            {[m.issuer, m.client].map((party, index) => (
              <k.V key={index} style={{ flex: 1, paddingLeft: index ? 30 : 0, borderLeftWidth: index ? 0.6 : 0, borderLeftColor: c.rule, marginLeft: index ? 10 : 0 }}>
                <k.T style={{ fontSize: 10, fontWeight: 600, color: c.ink, marginBottom: 3 }}>{party.name}</k.T>
                {party.lines.map((line) => (
                  <k.T key={line.value} style={t.small}>
                    {line.label ? <k.T style={{ fontWeight: 600, color: c.ink }}>{`${line.label}  `}</k.T> : null}
                    {line.value}
                  </k.T>
                ))}
                {party.missing ? <k.T style={{ ...t.small, color: c.muted }}>{party.missing}</k.T> : null}
              </k.V>
            ))}
          </k.V>
          <k.V blockId={m.acceptance?.invite ? "firma-invito" : undefined} style={{ marginTop: 22, borderTopWidth: 0.6, borderTopColor: c.rule, paddingTop: 14 }}>
            <k.T style={{ fontSize: 10, fontWeight: 600, color: c.ink }}>Per accettazione</k.T>
            <k.V style={{ flexDirection: "row", marginTop: 20 }}>
              {(["Data", "Firma"] as const).map((label, index) => (
                <k.V key={label} style={{ flex: 1, flexDirection: "row", alignItems: "flex-end", marginLeft: index ? 50 : 0 }}>
                  <k.T style={{ ...t.small, marginRight: 8 }}>{label}</k.T>
                  <AcceptanceValue k={k} m={m} field={label === "Data" ? "date" : "firma"} color={c.ink} lineStyle={{ flexGrow: 1, borderBottomWidth: 0.6, borderBottomColor: c.ink, marginBottom: 3, maxWidth: 170 }} />
                </k.V>
              ))}
            </k.V>
          </k.V>
        </k.V>,
        14,
        true,
      );
    case "chart":
      return wrap(
        <k.V>
          <SectionHead k={k} s={s} />
          <ChartBody k={k} m={m} s={s} theme={swissChart(m)} width={col} />
        </k.V>,
        26,
        true,
      );
    default:
      return null;
  }
}

function swissChart(m: DocModel): ChartTheme {
  return {
    page: c.page,
    ink: c.ink,
    soft: c.soft,
    muted: c.muted,
    rule: c.light,
    track: "#EFEFEF",
    palette: chartPalette(m.accent, c.ink, c.page),
    ...chartType(sans, c.ink, c.muted),
    radius: 0,
  };
}

function Track({ k, m, count }: { k: Kit; m: DocModel; count: number }) {
  const width = 533;
  // Nodes sit under the start of each step column, as in the mockup.
  const nodes = Array.from({ length: count }, (_, index) => 5 + (width / count) * index);
  return (
    <k.Svg width={width} height={20} viewBox={`0 0 ${width} 20`} style={{ marginTop: 14 }} a="line">
      <k.Line x1={6} y1={10} x2={nodes[nodes.length - 1] ?? 6} y2={10} stroke={c.ink} strokeWidth={0.8} />
      {nodes.map((x, index) => (
        <k.Circle key={index} cx={x} cy={10} r={4.6} fill={index === count - 1 ? m.accent : c.page} stroke={index === count - 1 ? m.accent : c.ink} strokeWidth={0.8} />
      ))}
    </k.Svg>
  );
}

export function renderSwiss(k: Kit, m: DocModel): ReactElement[] {
  const pages: ReactElement[] = [];
  const cover = <Cover key="cover" k={k} m={m} />;
  if (m.cover) pages.push(cover);
  m.pages.forEach((sections, index) => {
    pages.push(
      <k.Page key={`p${index}`} label={`Pagina ${index + 2}`} style={{ backgroundColor: c.page, color: c.ink, fontFamily: sans, paddingHorizontal: P, paddingTop: 34, paddingBottom: 34 }}>
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
