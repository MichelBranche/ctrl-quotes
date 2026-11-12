import type { ReactElement } from "react";
import { fonts, type Kit, type Style } from "../kit";
import { euro, fitTitle, subtitleLines, titleLines, type DocModel, type MoneyGroup, type Section } from "../model";
import { Brand, highlightGlyph, Icon, LineTable, optionsColumns, pad, Paras, servicesColumns, Watermark } from "./shared";

/** Corporate Executive: navy cover with architecture, orange numbering, navy table heads, cost breakdown chart. */

const c = {
  navy: "#10213D",
  navyDeep: "#0D1B33",
  white: "#FFFFFF",
  surface: "#F3F5F7",
  surfaceAlt: "#E9EDF2",
  secondary: "#6B778A",
  muted: "#9BA8B9",
  line: "#C7CFD9",
  peach: "#FFF0E8",
  text: "#1E2A3D",
};
const P = 31; // 11 mm
const sans = fonts.sans;

const t = {
  body: { fontSize: 10.6, lineHeight: 1.45, color: c.text } as Style,
  small: { fontSize: 9.2, lineHeight: 1.4, color: c.text } as Style,
};

function SectionHead({ k, m, s, extra, title }: { k: Kit; m: DocModel; s: Section; extra?: string; title?: string }) {
  return (
    <k.V style={{ flexDirection: "row", alignItems: "baseline", marginBottom: 12 }}>
      {s.no ? <k.T style={{ fontSize: 13, fontWeight: 700, color: m.accentText(c.white), width: 27 }}>{pad(s.no)}</k.T> : null}
      <k.T style={{ fontSize: 13, fontWeight: 700, color: c.navyDeep, letterSpacing: -0.2 }}>
        {title ?? ("heading" in s ? s.heading : "")}
        {extra ? <k.T style={{ fontSize: 11, fontWeight: 400, color: c.text }}>{`  ${extra}`}</k.T> : null}
      </k.T>
    </k.V>
  );
}

function Header({ k, m }: { k: Kit; m: DocModel }) {
  return (
    <k.V fixed style={{ marginBottom: 20 }}>
      <k.V style={{ flexDirection: "row", alignItems: "center", paddingBottom: 15, borderBottomWidth: 0.5, borderBottomColor: c.line }}>
        <k.V style={{ width: "44%" }}>
          <Brand k={k} m={m} dark={false} height={20} mark="corporate" gap={9} nameStyle={{ fontSize: 13.5, fontWeight: 600, color: c.navyDeep, letterSpacing: -0.2 }} />
        </k.V>
        <k.V style={{ flexGrow: 1 }}>
          <k.T style={{ fontSize: 9, lineHeight: 1.35, color: c.text }}>{`Proposta per ${m.header.client}\n${m.header.title}`}</k.T>
        </k.V>
        <k.PageNo style={{ fontSize: 10.5, color: c.text }} format={(page, total) => `${pad(page)} / ${pad(total)}`} />
      </k.V>
    </k.V>
  );
}

function Cover({ k, m }: { k: Kit; m: DocModel }) {
  const cover = m.cover;
  if (!cover) return null;
  const size = fitTitle(cover.title, 80, 46);
  const meta = [
    { icon: "calendar", label: "Data", value: cover.date },
    ...(cover.validity ? [{ icon: "clock", label: "Validità", value: cover.validity }] : []),
    ...(cover.project ? [{ icon: "layers", label: "Progetto", value: cover.project }] : []),
  ];
  const foot = 86;
  const photoHeight = 453;
  return (
    <k.Page cover label="Copertina" style={{ backgroundColor: c.navy, color: c.white, fontFamily: sans }}>
      <k.Svg width={595.28} height={760} viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: "absolute", top: 0, left: 0 }}>
        <k.Defs>
          <k.LinearGradient id="ce-bg" x1="0" y1="0" x2="0" y2="1">
            <k.Stop offset="0" stopColor="#13284A" />
            <k.Stop offset="1" stopColor={c.navyDeep} />
          </k.LinearGradient>
        </k.Defs>
        <k.Rect x={0} y={0} width={100} height={100} fill="url(#ce-bg)" />
      </k.Svg>
      {cover.coverPhoto ? (
        <k.V a="fade" style={{ position: "absolute", left: 0, right: 0, bottom: foot, height: photoHeight }}>
          <k.Img src={cover.coverPhoto} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          {/* Blends the photo sky into the navy page. */}
          <k.Svg width={595.28} height={photoHeight} viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: "absolute", top: 0, left: 0 }}>
            <k.Defs>
              <k.LinearGradient id="ce-blend" x1="0" y1="0" x2="0" y2="1">
                <k.Stop offset="0" stopColor="#13284A" stopOpacity={1} />
                <k.Stop offset="0.22" stopColor="#13284A" stopOpacity={0.35} />
                <k.Stop offset="0.5" stopColor="#13284A" stopOpacity={0} />
              </k.LinearGradient>
            </k.Defs>
            <k.Rect x={0} y={0} width={100} height={100} fill="url(#ce-blend)" />
          </k.Svg>
        </k.V>
      ) : null}
      <Watermark k={k} m={m} style={{ color: c.muted }} />
      <k.V blockId={cover.id ?? undefined} style={{ flexGrow: 1, paddingHorizontal: P + 7, paddingTop: 40 }}>
        <k.V a="fade" style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", paddingBottom: 26, borderBottomWidth: 0.6, borderBottomColor: "#C9D1DD" }}>
          <Brand k={k} m={m} dark height={36} mark="corporate" gap={14} maxWidth={190} nameStyle={{ fontSize: 17, fontWeight: 600, lineHeight: 1.12, color: c.white, maxWidth: 110 }} />
          <k.T style={{ fontSize: 10.4, lineHeight: 1.4, color: c.white, textAlign: "left" }}>{`Proposta commerciale\nN. ${cover.number}`}</k.T>
        </k.V>
        <k.T a="rise" style={{ fontSize: size, fontWeight: 700, lineHeight: 1.0, letterSpacing: -size * 0.03, color: c.white, marginTop: 70, maxWidth: "86%" }}>
          {titleLines(cover.title)}
        </k.T>
        <k.V style={{ width: 46, height: 4.5, backgroundColor: m.accent, marginTop: 26 }} />
        {cover.subtitle ? (
          <k.T a="fade" i={2} style={{ fontSize: 30, fontWeight: 500, lineHeight: 1.16, letterSpacing: -0.6, color: "#B5BFCD", marginTop: 26, maxWidth: "80%" }}>
            {subtitleLines(cover.subtitle)}
          </k.T>
        ) : null}
        {m.issuer.tagline ? (
          <k.T a="fade" i={3} style={{ fontSize: 13, lineHeight: 1.45, color: "#DCE2EA", marginTop: 22, maxWidth: 270 }}>
            {m.issuer.tagline}
          </k.T>
        ) : null}
      </k.V>
      <k.V style={{ height: foot, backgroundColor: c.white }}>
        <k.V style={{ flexGrow: 1, flexDirection: "row", alignItems: "center", paddingHorizontal: P + 7 }} stack>
          {meta.map((item, index) => (
            <k.V key={item.label} style={{ flex: 1, flexDirection: "row", alignItems: "flex-start", paddingLeft: index ? 18 : 0, borderLeftWidth: index ? 0.6 : 0, borderLeftColor: c.line, paddingVertical: 6 }}>
              <Icon k={k} name={item.icon} size={14} color={c.navy} width={1.7} />
              <k.V style={{ marginLeft: 10 }}>
                <k.T style={{ fontSize: 8.6, color: c.navy }}>{item.label}</k.T>
                <k.T style={{ fontSize: 8.6, color: c.navy, marginTop: 2 }}>{item.value}</k.T>
              </k.V>
            </k.V>
          ))}
        </k.V>
        <k.V style={{ height: 5.7, backgroundColor: m.accent }} />
      </k.V>
    </k.Page>
  );
}

function MoneyRow({ k, g }: { k: Kit; g: MoneyGroup }) {
  const strong = g.key === "oneTime";
  return (
    <k.V wrap={false} stack style={{ flexDirection: "row", marginBottom: 8 }}>
      <k.V hover="box" style={{ width: "48%", backgroundColor: strong ? c.navy : c.surface, borderRadius: 6, paddingVertical: 10, paddingHorizontal: 16 }}>
        <k.T style={{ fontSize: 11.5, fontWeight: 600, color: strong ? c.white : c.navyDeep }}>{g.title}</k.T>
        {g.caption ? <k.T style={{ fontSize: 9.6, color: strong ? "#DCE2EA" : c.text, marginTop: 1 }}>{`(${g.caption})`}</k.T> : null}
        <k.Amount a="fade" cents={g.totalCents} text={g.total} format={euro} style={{ fontSize: 25, fontWeight: 700, letterSpacing: -0.5, color: strong ? c.white : c.navyDeep, marginTop: 6 }} />
      </k.V>
      <k.V style={{ flexGrow: 1, flexBasis: 0, marginLeft: 18, paddingLeft: 20, borderLeftWidth: 0.5, borderLeftColor: c.line, justifyContent: "center" }}>
        {g.rows.map((row) => (
          <k.V key={row.label} style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}>
            <k.T style={t.small}>{row.label}</k.T>
            <k.T style={t.small}>{row.value}</k.T>
          </k.V>
        ))}
        <k.V style={{ flexDirection: "row", justifyContent: "space-between", borderTopWidth: 0.6, borderTopColor: c.secondary, paddingTop: 8, marginTop: 2 }}>
          <k.T style={{ fontSize: 11, fontWeight: 700, color: c.navyDeep }}>Totale</k.T>
          <k.T style={{ fontSize: 11, fontWeight: 700, color: c.navyDeep }}>{g.total}</k.T>
        </k.V>
      </k.V>
    </k.V>
  );
}

function BreakdownCards({ k, m, groups }: { k: Kit; m: DocModel; groups: MoneyGroup[] }) {
  const rows = m.breakdown;
  const max = Math.max(...rows.map((row) => row.share), 0.0001);
  const recurring = groups.filter((group) => group.key !== "oneTime");
  const oneTime = groups.find((group) => group.key === "oneTime");
  return (
    <k.V wrap={false} stack style={{ flexDirection: "row", marginTop: 8 }}>
      {rows.length ? (
        <k.V style={{ width: "58%", backgroundColor: c.surface, borderRadius: 6, paddingVertical: 11, paddingHorizontal: 13, marginRight: 14 }}>
          <k.T style={{ fontSize: 10.6, fontWeight: 700, color: c.navyDeep, marginBottom: 9 }}>Ripartizione costi (una tantum)</k.T>
          {rows.map((row, index) => (
            <k.V key={row.id} style={{ flexDirection: "row", alignItems: "center", marginBottom: 3.5 }}>
              <k.T style={{ fontSize: 8.4, color: c.text, width: 98 }}>{row.name}</k.T>
              <k.V style={{ flexGrow: 1, flexBasis: 0, height: 11 }}>
                <k.V a="bar" i={index} style={{ width: `${Math.max(3, (row.share / max) * 100)}%`, height: 11, backgroundColor: index === 0 ? m.accent : index === 1 ? "#3B4A63" : c.muted }} />
              </k.V>
              <k.T style={{ fontSize: 8.4, color: c.text, width: 30, textAlign: "right" }}>{row.percent}</k.T>
            </k.V>
          ))}
        </k.V>
      ) : null}
      <k.V style={{ flexGrow: 1, flexBasis: 0, backgroundColor: c.surface, borderRadius: 6, paddingVertical: 11, paddingHorizontal: 14 }}>
        <k.T style={{ fontSize: 10.6, fontWeight: 700, color: c.navyDeep, marginBottom: 12 }}>Totali del progetto</k.T>
        {oneTime ? (
          <k.V style={{ flexDirection: "row", alignItems: "center", marginBottom: 12 }}>
            <Icon k={k} name="coins" size={20} color={m.accent} width={1.5} />
            <k.V style={{ marginLeft: 12 }}>
              <k.T style={{ fontSize: 13.5, fontWeight: 700, color: c.navyDeep }}>{oneTime.total}</k.T>
              <k.T style={{ fontSize: 8.8, color: c.text, marginTop: 1 }}>Una tantum</k.T>
            </k.V>
          </k.V>
        ) : null}
        {recurring.map((group) => (
          <k.V key={group.key} style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
            <Icon k={k} name="calendar" size={20} color={m.accent} width={1.5} />
            <k.V style={{ marginLeft: 12 }}>
              <k.T style={{ fontSize: 13.5, fontWeight: 700, color: c.navyDeep }}>{`${group.total}${group.suffix}`}</k.T>
              <k.T style={{ fontSize: 8.8, color: c.text, marginTop: 1 }}>{group.key === "monthly" ? "Canone ricorrente" : "Canone annuale"}</k.T>
            </k.V>
          </k.V>
        ))}
      </k.V>
    </k.V>
  );
}

const termIcons: Record<string, string> = { payment: "payment", validity: "calendar", notes: "document", general: "document" };

function Block({ k, m, s, first }: { k: Kit; m: DocModel; s: Section; first: boolean }): ReactElement | null {
  const section = (children: ReactElement, opts: { extra?: string; gap?: number; head?: boolean; title?: string } = {}) => (
    <k.V blockId={s.id} a="rise" style={{ marginTop: first ? 0 : (opts.gap ?? 18) }}>
      {first || opts.head === false ? null : <k.V style={{ borderTopWidth: 0.5, borderTopColor: c.line, marginBottom: 12 }} />}
      {opts.head === false ? null : <SectionHead k={k} m={m} s={s} extra={opts.extra} title={opts.title} />}
      {children}
    </k.V>
  );
  const table = {
    head: { backgroundColor: c.navy, borderRadius: 4, paddingVertical: 7, paddingHorizontal: 8 },
    headText: { fontSize: 8.8, fontWeight: 600, color: c.white },
    nameCell: { fontSize: 8.8, fontWeight: 600, color: c.navyDeep, lineHeight: 1.3 },
    cell: { fontSize: 8.4, color: c.text, lineHeight: 1.34 },
    zebra: c.surface,
    empty: { ...t.small, color: c.secondary },
  };
  switch (s.kind) {
    case "intro":
      return section(
        <k.V stack style={{ flexDirection: "row" }}>
          <k.T style={{ width: "46%", fontSize: 34, fontWeight: 800, letterSpacing: -1.1, lineHeight: 1.05, color: c.navyDeep, paddingRight: 14 }}>{s.heading}</k.T>
          <k.V style={{ flexGrow: 1, flexBasis: 0, paddingTop: 2 }}>
            {s.lead ? <k.T style={{ fontSize: 11.5, fontWeight: 700, lineHeight: 1.3, color: c.navyDeep, marginBottom: 6 }}>{s.lead}</k.T> : null}
            <Paras k={k} text={s.body || "Descrivi qui il progetto e gli obiettivi del cliente."} style={{ ...t.body, color: s.body ? c.text : c.secondary }} />
            {s.points.map((point, index) => (
              <k.T key={index} style={{ ...t.small, marginTop: index ? 2 : 6 }}>{`• ${point}`}</k.T>
            ))}
            {s.quote ? <k.T style={{ fontSize: 11.5, fontWeight: 600, color: c.navyDeep, marginTop: 8 }}>{`“${s.quote}”`}</k.T> : null}
          </k.V>
        </k.V>,
        { title: "Introduzione" },
      );
    case "text":
      return section(<Paras k={k} text={s.body} style={t.body} />);
    case "image":
      return s.src ? (
        <k.V blockId={s.id} a="fade" style={{ marginTop: 18 }} wrap={false}>
          <k.Img src={s.src} alt={s.alt} style={{ width: "100%", height: 210, objectFit: "cover", borderRadius: 6 }} />
          {s.caption ? <k.T style={{ ...t.small, color: c.secondary, marginTop: 5 }}>{s.caption}</k.T> : null}
        </k.V>
      ) : null;
    case "highlights":
      return (
        <k.V blockId={s.id} a="rise" wrap={false} stack style={{ flexDirection: "row", backgroundColor: c.surface, borderRadius: 8, paddingVertical: 15, paddingHorizontal: 6, marginTop: 18 }}>
          {s.items.map((item, index) => (
            <k.V key={item.id} a="rise" i={index} style={{ flex: 1, paddingHorizontal: 14, borderLeftWidth: index ? 0.6 : 0, borderLeftColor: c.line }}>
              <Icon k={k} name={highlightGlyph.corporate[item.icon] ?? "target"} size={24} color={m.accent} width={1.5} />
              <k.T style={{ fontSize: 12.5, fontWeight: 700, color: c.navyDeep, marginTop: 9 }}>{item.title}</k.T>
              <k.T style={{ ...t.small, marginTop: 3 }}>{item.body}</k.T>
            </k.V>
          ))}
        </k.V>
      );
    case "services":
      return section(<LineTable k={k} rows={s.rows} columns={servicesColumns(m, [22, 34, 7, 14, 8, 15])} {...table} rowStyle={{ paddingVertical: 7.5, paddingHorizontal: 8, alignItems: "center" }} />, { gap: 20 });
    case "options":
      return section(
        <k.V>
          {s.body ? <Paras k={k} text={s.body} style={{ ...t.small, marginBottom: 8 }} /> : null}
          <LineTable k={k} rows={s.rows} columns={optionsColumns(m, [27, 52, 21])} {...table} zebra={undefined} rowStyle={{ paddingVertical: 7, paddingHorizontal: 8, alignItems: "center", borderBottomWidth: 0.5, borderBottomColor: c.line }} />
        </k.V>,
        { extra: "(non incluse nel totale)", gap: 20 },
      );
    case "summary":
      return section(
        <k.V>
          {s.groups.map((group) => (
            <MoneyRow key={group.key} k={k} g={group} />
          ))}
          {s.breakdown && s.groups.length ? <BreakdownCards k={k} m={m} groups={s.groups} /> : null}
          {s.notices.map((notice) => (
            <k.T key={notice} style={{ ...t.small, color: c.secondary, marginTop: 4 }}>
              {notice}
            </k.T>
          ))}
          {s.body ? <Paras k={k} text={s.body} style={{ ...t.small, marginTop: 6 }} /> : null}
        </k.V>,
      );
    case "timeline":
      return section(
        <k.V wrap={false}>
          <k.V style={{ height: 18 }}>
            <k.V a="line" style={{ position: "absolute", top: 8.5, left: `${50 / s.steps.length}%`, right: `${50 / s.steps.length}%`, borderTopWidth: 0.8, borderTopColor: c.muted }} />
            <k.V style={{ flexDirection: "row" }}>
              {s.steps.map((step, index) => {
                const last = index === s.steps.length - 1;
                return (
                  <k.V key={step.id} style={{ flex: 1, alignItems: "center" }}>
                    <k.V a="node" i={index} style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: last ? m.accent : c.muted, alignItems: "center", justifyContent: "center" }}>
                      <k.T style={{ fontSize: 8, fontWeight: 600, color: last ? m.onAccent : c.white }}>{String(index + 1)}</k.T>
                    </k.V>
                  </k.V>
                );
              })}
            </k.V>
          </k.V>
          <k.V style={{ flexDirection: "row", marginTop: 8 }} stack>
            {s.steps.map((step) => (
              <k.V key={step.id} style={{ flex: 1, alignItems: "center" }}>
                <k.V style={{ width: 104 }}>
                  <k.T style={{ fontSize: 9.4, fontWeight: 700, color: c.navyDeep }}>{step.label}</k.T>
                  <k.T style={{ ...t.small, marginTop: 2 }}>{step.title}</k.T>
                </k.V>
              </k.V>
            ))}
          </k.V>
        </k.V>,
        { gap: 12 },
      );
    case "terms":
      return section(
        <k.V wrap={false} style={{ flexDirection: "row" }} stack>
          {s.columns.map((column, index) => (
            <k.V key={column.key} style={{ flex: column.key === "general" ? 1.4 : 1, flexDirection: "row", paddingLeft: index ? 14 : 0, marginLeft: index ? 8 : 0, borderLeftWidth: index ? 0.5 : 0, borderLeftColor: c.line }}>
              <Icon k={k} name={termIcons[column.key] ?? "document"} size={17} color={m.accent} width={1.5} />
              <k.V style={{ marginLeft: 9, flexGrow: 1, flexBasis: 0 }}>
                <k.T style={{ fontSize: 10, fontWeight: 700, color: c.navyDeep, marginBottom: 3 }}>{column.title}</k.T>
                <k.T style={{ ...t.small, fontSize: 8.8 }}>{column.body}</k.T>
              </k.V>
            </k.V>
          ))}
        </k.V>,
        { gap: 12 },
      );
    case "contacts":
      return section(
        <k.V wrap={false}>
          {s.body ? <Paras k={k} text={s.body} style={{ ...t.small, marginBottom: 8 }} /> : null}
          <k.V style={{ flexDirection: "row" }} stack>
            {[m.issuer, m.client].map((party, index) => (
              <k.V key={index} style={{ flex: 1, paddingLeft: index ? 12 : 0, paddingRight: 8, borderLeftWidth: index ? 0.5 : 0, borderLeftColor: c.line }}>
                <k.T style={{ fontSize: 9, fontWeight: 700, color: c.navyDeep, marginBottom: 2 }}>{party.name}</k.T>
                {party.lines.map((line) => (
                  <k.T key={line.value} style={{ ...t.small, fontSize: 8.8 }}>
                    {line.label ? <k.T style={{ fontWeight: 700 }}>{`${line.label}  `}</k.T> : null}
                    {line.value}
                  </k.T>
                ))}
                {party.missing ? <k.T style={{ ...t.small, color: c.secondary }}>{party.missing}</k.T> : null}
              </k.V>
            ))}
            <k.V hover="box" style={{ width: "33%", backgroundColor: c.peach, borderRadius: 6, paddingVertical: 13, paddingHorizontal: 13, marginLeft: 8 }}>
              <k.T style={{ fontSize: 9.2, fontWeight: 600, color: m.accentText(c.peach) }}>Per accettazione</k.T>
              {["Data", "Firma"].map((label) => (
                <k.V key={label} style={{ flexDirection: "row", alignItems: "flex-end", marginTop: 13 }}>
                  <k.T style={{ fontSize: 8.8, color: c.text, width: 32 }}>{label}</k.T>
                  <k.V style={{ flexGrow: 1, borderBottomWidth: 0.6, borderBottomColor: c.text, marginBottom: 2 }} />
                </k.V>
              ))}
            </k.V>
          </k.V>
        </k.V>,
        { gap: 12 },
      );
    default:
      return null;
  }
}

export function renderCorporate(k: Kit, m: DocModel): ReactElement[] {
  const pages: ReactElement[] = [];
  if (m.cover) pages.push(<Cover key="cover" k={k} m={m} />);
  m.pages.forEach((sections, index) => {
    pages.push(
      <k.Page key={`p${index}`} label={`Pagina ${index + 2}`} style={{ backgroundColor: c.white, color: c.text, fontFamily: sans, paddingHorizontal: P - 6, paddingTop: 30, paddingBottom: 30 }}>
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

