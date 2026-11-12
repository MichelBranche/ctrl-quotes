import type { ReactElement } from "react";
import { fonts, type Kit, type Style } from "../kit";
import { euro, fitTitle, subtitleLines, titleLines, type DocModel, type MoneyGroup, type Section } from "../model";
import { Brand, LineTable, optionsColumns, pad, Paras, servicesColumns, Watermark } from "./shared";

/** Editorial Atelier: ivory paper, large serif, full-bleed architecture photo, terracotta figures, olive signature band. */

const c = {
  paper: "#F7F2EA",
  ink: "#1F1B18",
  muted: "#4B4037",
  olive: "#6B7046",
  rule: "#8D877F",
  soft: "#CFC7BD",
  cream: "#FFF8ED",
};
const P = 30; // 10.5 mm
const serif = fonts.serif;
const sans = fonts.sans;

const t = {
  body: { fontFamily: sans, fontSize: 10.8, lineHeight: 1.45, color: c.ink } as Style,
  small: { fontFamily: sans, fontSize: 9.2, lineHeight: 1.4, color: c.ink } as Style,
  sectionNo: { fontFamily: fonts.figures, fontSize: 11, color: c.ink, width: 30 } as Style,
  sectionTitle: { fontFamily: serif, fontSize: 17, fontWeight: 500, color: c.ink, letterSpacing: -0.2 } as Style,
};

const hair = (k: Kit, color = c.rule) => <k.V style={{ borderTopWidth: 0.5, borderTopColor: color }} />;

function SectionHead({ k, m, s, first, extra }: { k: Kit; m: DocModel; s: Section; first: boolean; extra?: string }) {
  return (
    <k.V style={{ flexDirection: "row", alignItems: "baseline", paddingBottom: 9, borderBottomWidth: 0.5, borderBottomColor: c.rule }}>
      <k.T style={t.sectionNo}>{pad(s.no)}</k.T>
      <k.T style={{ ...t.sectionTitle, flexGrow: 1, flexBasis: 0 }}>
        {"heading" in s ? s.heading : ""}
        {extra ? <k.T style={{ fontSize: 12.5, fontWeight: 400 }}>{`  ${extra}`}</k.T> : null}
      </k.T>
      {first ? <k.T style={{ fontFamily: serif, fontStyle: "italic", fontSize: 12.5, color: c.ink }}>{m.issuer.display}</k.T> : null}
    </k.V>
  );
}

function Cover({ k, m }: { k: Kit; m: DocModel }) {
  const cover = m.cover;
  if (!cover) return null;
  const size = fitTitle(cover.title, 106, 62);
  const meta = [
    { label: "Data", value: cover.date },
    ...(cover.validity ? [{ label: "Validità", value: cover.validity }] : []),
    ...(cover.project ? [{ label: "Progetto", value: cover.project }] : []),
  ];
  const head = 88;
  const foot = 92;
  return (
    <k.Page cover label="Copertina" style={{ backgroundColor: c.paper, color: c.ink, fontFamily: sans }}>
      <k.V blockId={cover.id ?? undefined} style={{ flexGrow: 1 }}>
        <k.V style={{ height: head, paddingHorizontal: P + 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }} a="fade">
          <Brand k={k} m={m} dark={false} height={30} maxWidth={190} nameStyle={{ fontFamily: serif, fontSize: 28, fontWeight: 600, letterSpacing: -0.4, color: c.ink }} />
          <k.T style={{ fontFamily: serif, fontSize: 12, lineHeight: 1.2, color: c.ink }}>{`Proposta commerciale\nN. ${cover.number}`}</k.T>
        </k.V>
        <k.V style={{ flexGrow: 1, backgroundColor: "#3A342D" }}>
          {cover.coverPhoto ? <k.Img a="fade" src={cover.coverPhoto} style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", objectFit: "cover" }} /> : null}
          {/* A soft shade keeps the cream title readable on any photo. */}
          <k.Svg width={595.28} height={330} viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: "absolute", left: 0, bottom: 0 }}>
            <k.Defs>
              <k.LinearGradient id="ea-shade" x1="0" y1="0" x2="0" y2="1">
                <k.Stop offset="0" stopColor="#1F1B18" stopOpacity={0} />
                <k.Stop offset="1" stopColor="#1F1B18" stopOpacity={0.42} />
              </k.LinearGradient>
            </k.Defs>
            <k.Rect x={0} y={0} width={100} height={100} fill="url(#ea-shade)" />
          </k.Svg>
          <k.V style={{ position: "absolute", left: P + 24, right: P + 24, bottom: 34 }}>
            <k.T a="rise" style={{ fontFamily: serif, fontSize: size, fontWeight: 500, lineHeight: 0.9, letterSpacing: -size * 0.02, color: c.cream, maxWidth: "88%" }}>
              {titleLines(cover.title)}
            </k.T>
            {cover.subtitle ? (
              <k.V a="fade" i={2}>
                <k.V style={{ width: 30, borderTopWidth: 1, borderTopColor: c.cream, marginTop: 26, marginBottom: 14 }} />
                <k.T style={{ fontFamily: serif, fontStyle: "italic", fontSize: 40, lineHeight: 1.06, letterSpacing: -0.4, color: c.cream }}>{subtitleLines(cover.subtitle)}</k.T>
              </k.V>
            ) : null}
          </k.V>
        </k.V>
        <k.V style={{ height: foot, paddingHorizontal: P + 14, flexDirection: "row", alignItems: "center" }} stack>
          {meta.map((item, index) => (
            <k.V key={item.label} style={{ flex: 1, paddingLeft: index ? 18 : 0, borderLeftWidth: index ? 0.5 : 0, borderLeftColor: c.rule, paddingVertical: 4 }}>
              <k.T style={{ fontSize: 9.4, color: c.ink }}>{item.label}</k.T>
              <k.T style={{ fontSize: 9.4, color: c.ink, marginTop: 3 }}>{item.value}</k.T>
            </k.V>
          ))}
        </k.V>
      </k.V>
      <Watermark k={k} m={m} style={{ color: c.muted }} />
    </k.Page>
  );
}

/** Splits a paragraph so its first words sit beside the drop cap, like a float. */
function dropCapSplit(text: string, chars: number): [string, string, string] {
  const clean = text.trim();
  const cap = clean.slice(0, 1);
  const rest = clean.slice(1);
  if (rest.length <= chars) return [cap, rest, ""];
  const cut = rest.lastIndexOf(" ", chars);
  const at = cut > chars * 0.6 ? cut : chars;
  return [cap, rest.slice(0, at), rest.slice(at).trim()];
}

function Intro({ k, m, s }: { k: Kit; m: DocModel; s: Extract<Section, { kind: "intro" }> }) {
  const photo = m.cover?.interiorPhoto ?? null;
  const body = s.body.split(/\n{2,}/)[0] ?? "";
  const more = s.body.split(/\n{2,}/).slice(1).join("\n\n");
  const [cap, beside, after] = dropCapSplit(body, 92);
  const lead = s.lead || "Racconta qui, in una frase, il cuore del progetto.";
  return (
    <k.V>
      <k.V stack style={{ flexDirection: "row", paddingTop: 14, paddingBottom: 16 }}>
        <k.T a="rise" style={{ width: "54%", fontFamily: serif, fontSize: 36, fontWeight: 500, lineHeight: 1.0, letterSpacing: -0.9, color: s.lead ? c.ink : c.rule, paddingRight: 16 }}>
          {lead}
        </k.T>
        <k.V style={{ flexGrow: 1, flexBasis: 0, paddingTop: 4 }}>
          {body ? (
            <k.V>
              <k.V style={{ flexDirection: "row" }}>
                <k.T decorative style={{ fontFamily: serif, fontSize: 50, lineHeight: 0.86, color: m.accentText(c.paper), width: 31, marginTop: 1 }}>
                  {cap}
                </k.T>
                <k.T style={{ ...t.body, flexGrow: 1, flexBasis: 0 }}>{beside}</k.T>
              </k.V>
              {after ? <k.T style={t.body}>{after}</k.T> : null}
              {more ? <Paras k={k} text={more} style={{ ...t.body, marginTop: 6 }} /> : null}
            </k.V>
          ) : (
            <k.T style={{ ...t.body, color: c.rule }}>Descrivi qui il progetto e gli obiettivi del cliente.</k.T>
          )}
          {s.points.map((point, index) => (
            <k.T key={index} style={{ ...t.small, marginTop: index ? 2 : 8 }}>{`• ${point}`}</k.T>
          ))}
        </k.V>
      </k.V>
      {s.quote || photo ? (
        <k.V stack style={{ flexDirection: "row" }} wrap={false}>
          {s.quote ? (
            <k.V style={{ width: photo ? "42%" : "100%", borderTopWidth: 0.5, borderTopColor: c.rule, borderBottomWidth: 0.5, borderBottomColor: c.rule, paddingTop: 16, paddingRight: 14, paddingBottom: 14 }}>
              <k.T a="fade" style={{ fontFamily: serif, fontStyle: "italic", fontSize: 28, lineHeight: 1.08, letterSpacing: -0.4, color: c.muted }}>{`“${s.quote}”`}</k.T>
            </k.V>
          ) : null}
          {photo ? (
            <k.V style={{ flexGrow: 1, flexBasis: 0, height: 150 }}>
              <k.Img a="fade" src={photo} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            </k.V>
          ) : null}
        </k.V>
      ) : null}
    </k.V>
  );
}

function Money({ k, m, g, last }: { k: Kit; m: DocModel; g: MoneyGroup; last: boolean }) {
  return (
    <k.V stack style={{ flexDirection: "row" }} wrap={false}>
      <k.V style={{ width: "48%", paddingTop: 10, paddingBottom: 11, paddingRight: 12, borderBottomWidth: last ? 0 : 0.5, borderBottomColor: c.soft }}>
        <k.Amount a="rise" cents={g.totalCents} text={g.headline} format={(cents) => euro(cents).replace(/,00$/, "")} style={{ fontFamily: fonts.figures, fontSize: 70, lineHeight: 1, letterSpacing: -1.2, color: m.accentText(c.paper) }} />
        <k.T style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.8, textTransform: "uppercase", color: c.ink, marginTop: 4 }}>{g.title}</k.T>
        {g.caption ? <k.T style={{ ...t.small, marginTop: 2 }}>{`(${g.caption})`}</k.T> : null}
      </k.V>
      <k.V style={{ flexGrow: 1, flexBasis: 0, paddingLeft: 20, paddingTop: 18, borderLeftWidth: 0.5, borderLeftColor: c.rule }}>
        {g.rows.map((row) => (
          <k.V key={row.label} style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 5 }}>
            <k.T style={t.small}>{row.label}</k.T>
            <k.T style={t.small}>{row.value}</k.T>
          </k.V>
        ))}
        <k.V style={{ flexDirection: "row", justifyContent: "space-between", borderTopWidth: 0.5, borderTopColor: c.rule, paddingTop: 9, marginTop: 4 }}>
          <k.T style={{ fontSize: 11.5, fontWeight: 600, color: c.ink }}>Totale</k.T>
          <k.T style={{ fontSize: 11.5, fontWeight: 700, color: c.ink }}>{g.total}</k.T>
        </k.V>
      </k.V>
    </k.V>
  );
}

function Track({ k, count, width }: { k: Kit; count: number; width: number }) {
  const step = count > 1 ? (width - 16) / (count - 1) : 0;
  const nodes = Array.from({ length: count }, (_, index) => 8 + step * index);
  return (
    <k.Svg width={width} height={16} viewBox={`0 0 ${width} 16`} a="line">
      <k.Line x1={8} y1={8} x2={nodes[nodes.length - 1] ?? 8} y2={8} stroke={c.olive} strokeWidth={0.8} />
      {nodes.map((x, index) => (
        <k.Circle key={index} cx={x} cy={8} r={5} fill={index === count - 1 ? c.olive : c.paper} stroke={c.olive} strokeWidth={0.9} />
      ))}
    </k.Svg>
  );
}

function Block({ k, m, s, first }: { k: Kit; m: DocModel; s: Section; first: boolean }): ReactElement | null {
  const section = (children: ReactElement | null, extra?: string, gap = 22) => (
    <k.V blockId={s.id} a="rise" style={{ marginTop: first ? 0 : gap }}>
      {first ? null : hair(k, c.rule)}
      <k.V style={{ paddingTop: first ? 0 : 12 }}>
        <SectionHead k={k} m={m} s={s} first={first} extra={extra} />
        {children}
      </k.V>
    </k.V>
  );
  const table = { head: { paddingVertical: 7, paddingHorizontal: 2, borderBottomWidth: 0.5, borderBottomColor: c.rule }, headText: { fontSize: 8.8, fontWeight: 700, color: c.ink }, nameCell: { fontSize: 9, fontWeight: 700, color: c.ink, lineHeight: 1.3 }, cell: { fontSize: 8.8, color: c.ink, lineHeight: 1.36 }, empty: { ...t.small, color: c.rule } };
  switch (s.kind) {
    case "intro":
      return section(<Intro k={k} m={m} s={s} />);
    case "text":
      return section(<Paras k={k} text={s.body} style={{ ...t.body, marginTop: 12 }} />);
    case "image":
      return s.src ? (
        <k.V blockId={s.id} a="fade" style={{ marginTop: 22 }} wrap={false}>
          <k.Img src={s.src} alt={s.alt} style={{ width: "100%", height: 220, objectFit: "cover" }} />
          {s.caption ? <k.T style={{ fontFamily: serif, fontStyle: "italic", fontSize: 11, color: c.muted, marginTop: 6 }}>{s.caption}</k.T> : null}
        </k.V>
      ) : null;
    case "highlights":
      return section(
        <k.V stack style={{ flexDirection: "row", marginTop: 12 }}>
          {s.items.map((item, index) => (
            <k.V key={item.id} style={{ flex: 1, paddingLeft: index ? 14 : 0, marginLeft: index ? 10 : 0, borderLeftWidth: index ? 0.5 : 0, borderLeftColor: c.soft }}>
              <k.T style={{ fontFamily: serif, fontSize: 15, fontWeight: 500, color: c.ink }}>{item.title}</k.T>
              <k.T style={{ ...t.small, marginTop: 3 }}>{item.body}</k.T>
            </k.V>
          ))}
        </k.V>,
      );
    case "services":
      return section(
        <LineTable k={k} rows={s.rows} columns={servicesColumns(m, [21, 34, 6, 14, 9, 16])} {...table} rowStyle={{ paddingVertical: 5.5, paddingHorizontal: 2, borderBottomWidth: 0.4, borderBottomColor: c.soft, alignItems: "center" }} />,
        undefined,
        16,
      );
    case "options":
      return section(
        <k.V>
          {s.body ? <Paras k={k} text={s.body} style={{ ...t.small, marginTop: 8 }} /> : null}
          <LineTable k={k} rows={s.rows} columns={optionsColumns(m, [28, 52, 20])} {...table} head={{ height: 0, overflow: "hidden" }} rowStyle={{ paddingVertical: 6.5, paddingHorizontal: 2, borderBottomWidth: 0.4, borderBottomColor: c.rule, alignItems: "center" }} />
        </k.V>,
        "(non incluse nel totale)",
        18,
      );
    case "summary":
      return section(
        <k.V>
          {s.groups.map((group, index) => (
            <Money key={group.key} k={k} m={m} g={group} last={index === s.groups.length - 1} />
          ))}
          {s.notices.map((notice) => (
            <k.T key={notice} style={{ ...t.small, color: c.muted, marginTop: 4 }}>
              {notice}
            </k.T>
          ))}
          {s.body ? <Paras k={k} text={s.body} style={{ ...t.small, marginTop: 6 }} /> : null}
        </k.V>,
      );
    case "timeline":
      return section(
        <k.V wrap={false} style={{ paddingTop: 14 }}>
          <Track k={k} count={s.steps.length} width={535} />
          <k.V style={{ flexDirection: "row", marginTop: 8 }} stack>
            {s.steps.map((step, index) => (
              <k.V key={step.id} style={{ flex: 1, alignItems: index === 0 ? "flex-start" : index === s.steps.length - 1 ? "flex-end" : "center" }}>
                <k.V style={{ width: 110 }}>
                  <k.T style={{ fontSize: 9.6, fontWeight: 700, color: c.ink }}>{step.label}</k.T>
                  <k.T style={{ ...t.small, marginTop: 2 }}>{step.title}</k.T>
                </k.V>
              </k.V>
            ))}
          </k.V>
        </k.V>,
        undefined,
        15,
      );
    case "terms":
      return section(
        <k.V wrap={false} style={{ flexDirection: "row", paddingTop: 12 }} stack>
          {s.columns.map((column, index) => (
            <k.V key={column.key} style={{ flex: column.key === "general" ? 1.4 : 1, paddingLeft: index ? 14 : 0, marginLeft: index ? 8 : 0, borderLeftWidth: index ? 0.5 : 0, borderLeftColor: c.rule }}>
              <k.T style={{ fontSize: 10.4, fontWeight: 700, color: c.ink, marginBottom: 3 }}>{column.title}</k.T>
              <k.T style={t.small}>{column.body}</k.T>
            </k.V>
          ))}
        </k.V>,
        undefined,
        15,
      );
    case "contacts":
      return section(
        <k.V wrap={false} style={{ paddingTop: 12 }}>
          {s.body ? <Paras k={k} text={s.body} style={{ ...t.small, marginBottom: 8 }} /> : null}
          <k.V style={{ flexDirection: "row" }} stack>
            {[m.issuer, m.client].map((party, index) => (
              <k.V key={index} style={{ flex: 1, paddingLeft: index ? 40 : 0, borderLeftWidth: index ? 0.5 : 0, borderLeftColor: c.rule }}>
                <k.T style={{ fontSize: 9.8, fontWeight: 700, color: c.ink, marginBottom: 2 }}>{party.name}</k.T>
                {party.lines.map((line) => (
                  <k.T key={line.value} style={t.small}>
                    {line.label ? <k.T style={{ fontWeight: 700 }}>{`${line.label}  `}</k.T> : null}
                    {line.value}
                  </k.T>
                ))}
                {party.missing ? <k.T style={{ ...t.small, color: c.rule }}>{party.missing}</k.T> : null}
              </k.V>
            ))}
          </k.V>
          <k.V hover="box" wrap={false} style={{ marginTop: 14, marginHorizontal: -6, backgroundColor: c.olive, paddingVertical: 14, paddingHorizontal: 22 }}>
            <k.T style={{ fontFamily: serif, fontStyle: "italic", fontSize: 17, color: c.cream }}>Per accettazione</k.T>
            <k.V style={{ flexDirection: "row", marginTop: 12 }} stack>
              {["Data", "Firma"].map((label) => (
                <k.V key={label} style={{ flex: 1, flexDirection: "row", alignItems: "flex-end", paddingRight: 20 }}>
                  <k.T style={{ fontSize: 9.4, color: c.cream, marginRight: 14 }}>{label}</k.T>
                  <k.V style={{ flexGrow: 1, borderBottomWidth: 0.6, borderBottomColor: c.cream, marginBottom: 3 }} />
                </k.V>
              ))}
            </k.V>
          </k.V>
        </k.V>,
        undefined,
        15,
      );
    default:
      return null;
  }
}

export function renderAtelier(k: Kit, m: DocModel): ReactElement[] {
  const pages: ReactElement[] = [];
  if (m.cover) pages.push(<Cover key="cover" k={k} m={m} />);
  m.pages.forEach((sections, index) => {
    pages.push(
      <k.Page key={`p${index}`} label={`Pagina ${index + 2}`} style={{ backgroundColor: c.paper, color: c.ink, fontFamily: sans, paddingHorizontal: P, paddingTop: 30, paddingBottom: 30 }}>
        <Watermark k={k} m={m} style={{ color: c.muted }} />
        {sections.map((section, position) => (
          <Block key={section.id} k={k} m={m} s={section} first={position === 0} />
        ))}
      </k.Page>,
    );
  });
  return pages;
}
