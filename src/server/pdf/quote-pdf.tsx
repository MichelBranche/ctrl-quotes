import "server-only";
import path from "node:path";
import { Document, Font, Image, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import type { ReactNode } from "react";
import { readableOn, type BrandFont } from "@/domain/brand";
import { catalogBillingLabel } from "@/domain/catalog";
import { formatEuro } from "@/domain/money";
import { blockLabel, formatPercentBp, formatQuantity, lineNetCents, type BlockOf, type QuoteBlock, type QuoteLine } from "@/domain/quote-document";
import {
  billingSuffix,
  clientLines,
  formatLongDate,
  headlineTotal,
  issuerLines,
  optionsTotalLabel,
  sectionNumbers,
  summaryGroups,
  type QuoteSnapshot,
} from "@/domain/quote-snapshot";

/**
 * Print renderer. Vector text with embedded fonts, real page breaks and a repeated footer.
 * It reads the same snapshot as the HTML renderer and never rasterises the page.
 */

const fontDir = path.join(process.cwd(), "src/server/pdf/fonts");
let registered = false;

function registerFonts() {
  if (registered) return;
  Font.register({
    family: "CQInter",
    fonts: [
      { src: path.join(fontDir, "inter-latin-400-normal.woff"), fontWeight: 400 },
      { src: path.join(fontDir, "inter-latin-600-normal.woff"), fontWeight: 600 },
      { src: path.join(fontDir, "inter-latin-700-normal.woff"), fontWeight: 700 },
    ],
  });
  Font.register({
    family: "CQInstrument",
    fonts: [
      { src: path.join(fontDir, "instrument-serif-latin-400-normal.woff"), fontWeight: 400 },
      { src: path.join(fontDir, "instrument-serif-latin-400-italic.woff"), fontWeight: 400, fontStyle: "italic" },
    ],
  });
  // Italian text is not hyphenated by the PDF engine: words wrap whole.
  Font.registerHyphenationCallback((word) => [word]);
  registered = true;
}

type Fonts = { heading: string; body: string; headingWeight: 400 | 600 | 700; serifHeading: boolean };

function family(font: BrandFont): string {
  switch (font) {
    case "Inter":
      return "CQInter";
    case "Instrument Serif":
      return "CQInstrument";
    case "Georgia":
      return "Times-Roman";
    case "Sistema":
      return "Helvetica";
    default: {
      const exhaustive: never = font;
      return exhaustive;
    }
  }
}

function fontsFor(snapshot: QuoteSnapshot): Fonts {
  const editorial = snapshot.template === "editorial";
  const heading = editorial ? "CQInstrument" : family(snapshot.brand.fontHeading);
  const singleWeight = heading === "CQInstrument";
  const body = family(snapshot.brand.fontBody) === "CQInstrument" ? "CQInter" : family(snapshot.brand.fontBody);
  return { heading, body, headingWeight: singleWeight ? 400 : snapshot.template === "bold" ? 700 : 600, serifHeading: singleWeight };
}

const palette = {
  ink: "#15141A",
  muted: "#6B6775",
  rule: "#E7E5EC",
  paper: "#FFFFFF",
  editorialPaper: "#F7F2EC",
  editorialRule: "#DDD3C6",
  band: "#F3F5F9",
  boldInk: "#0B0B0F",
  white: "#FFFFFF",
};

function styles(snapshot: QuoteSnapshot, fonts: Fonts) {
  const t = snapshot.template;
  const primary = snapshot.brand.colorPrimary;
  const accent = snapshot.brand.colorSecondary;
  const paper = t === "editorial" ? palette.editorialPaper : palette.paper;
  const rule = t === "editorial" ? palette.editorialRule : palette.rule;
  return {
    primary,
    accent,
    paper,
    rule,
    sheet: StyleSheet.create({
      page: { backgroundColor: paper, color: palette.ink, fontFamily: fonts.body, fontSize: 9.5, lineHeight: 1.5, paddingTop: 54, paddingBottom: 60, paddingHorizontal: 48 },
      coverPage: { backgroundColor: t === "bold" ? palette.boldInk : paper, color: t === "bold" ? palette.white : palette.ink, fontFamily: fonts.body, padding: 0 },
      cover: { flexGrow: 1, paddingHorizontal: 48, paddingTop: t === "corporate" ? 0 : 48, paddingBottom: 48, display: "flex", flexDirection: "column" },
      coverHead: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "flex-start",
        ...(t === "corporate" ? { backgroundColor: primary, color: readableOn(primary), marginHorizontal: -48, paddingHorizontal: 48, paddingVertical: 28 } : {}),
      },
      logo: { maxWidth: 150, maxHeight: 40, objectFit: "contain" },
      logoText: { fontFamily: fonts.heading, fontWeight: fonts.headingWeight, fontSize: 15, lineHeight: 1.2 },
      numberBox: { alignItems: "flex-end" },
      small: { fontSize: 7.5, color: t === "bold" ? "#BDBAC4" : palette.muted, textTransform: "uppercase", letterSpacing: 1 },
      numberText: { fontSize: 10, fontWeight: fonts.body === "CQInter" ? 600 : 400 },
      coverMain: { flexGrow: 1, justifyContent: t === "corporate" ? "flex-end" : "center", paddingVertical: 24 },
      kicker: { fontSize: 8, color: t === "minimal" ? palette.muted : accent, textTransform: "uppercase", letterSpacing: 1.6, marginBottom: 10 },
      title: {
        fontFamily: fonts.heading,
        fontWeight: fonts.headingWeight,
        fontSize: t === "editorial" ? 50 : t === "bold" ? 52 : t === "corporate" ? 34 : 40,
        lineHeight: 1.05,
        letterSpacing: t === "bold" ? -1.5 : -0.8,
      },
      subtitle: { marginTop: 14, fontSize: 12, color: t === "bold" ? "#D8D5DE" : palette.muted, maxWidth: 380 },
      coverTotalLabel: { marginTop: 26, fontSize: 8, letterSpacing: 1.4, textTransform: "uppercase", color: "#BDBAC4" },
      coverTotal: { fontFamily: fonts.heading, fontWeight: fonts.headingWeight, fontSize: 30, lineHeight: 1.15, color: accent },
      coverImage: { width: "100%", height: 230, objectFit: "cover", borderRadius: 3, marginBottom: 22 },
      shape: { width: 70, height: 2, backgroundColor: accent, marginBottom: 22 },
      boldCircle: { position: "absolute", right: -80, bottom: -80, width: 200, height: 200, borderRadius: 100, backgroundColor: accent },
      issuerBand: { marginTop: 10, fontSize: 8, color: palette.muted },
      meta: {
        flexDirection: "row",
        borderTopWidth: t === "corporate" ? 0 : 1,
        borderTopColor: t === "bold" ? "#3A3842" : rule,
        paddingTop: t === "corporate" ? 0 : 12,
        ...(t === "corporate" ? { borderWidth: 1, borderColor: rule } : {}),
      },
      metaItem: {
        flexGrow: 1,
        flexBasis: 0,
        ...(t === "corporate" ? { backgroundColor: palette.band, padding: 10, borderRightWidth: 1, borderRightColor: rule } : { paddingRight: 18 }),
      },
      metaValue: { fontSize: 10, fontWeight: fonts.body === "CQInter" ? 600 : 400, marginTop: 2 },
      running: { position: "absolute", top: 22, left: 48, right: 48, flexDirection: "row", justifyContent: "space-between", fontSize: 7.5, color: palette.muted },
      footer: { position: "absolute", bottom: 26, left: 48, right: 48, flexDirection: "row", justifyContent: "space-between", fontSize: 7.5, color: palette.muted, borderTopWidth: 0.5, borderTopColor: rule, paddingTop: 6 },
      section: { marginBottom: 22 },
      h2Row: {
        flexDirection: "row",
        alignItems: "flex-end",
        marginBottom: 8,
        ...(t === "corporate" ? { borderBottomWidth: 1.5, borderBottomColor: primary, paddingBottom: 4 } : {}),
      },
      index: {
        fontSize: 8,
        marginRight: 8,
        fontWeight: fonts.body === "CQInter" ? 700 : 400,
        color: t === "corporate" ? primary : t === "bold" ? readableOn(accent) : accent,
        ...(t === "bold" ? { backgroundColor: accent, paddingHorizontal: 5, paddingVertical: 1.5, borderRadius: 6 } : {}),
      },
      h2: {
        fontFamily: fonts.heading,
        fontWeight: fonts.headingWeight,
        fontSize: t === "editorial" ? 22 : t === "bold" ? 18 : t === "corporate" ? 11.5 : 14,
        lineHeight: 1.2,
        ...(t === "corporate" ? { textTransform: "uppercase", letterSpacing: 0.6 } : {}),
      },
      paragraph: { marginBottom: 6 },
      muted: { color: palette.muted },
      table: { ...(t === "corporate" ? { borderWidth: 0.75, borderColor: rule } : {}) },
      th: {
        flexDirection: "row",
        fontSize: 7,
        textTransform: "uppercase",
        letterSpacing: 0.8,
        color: t === "corporate" ? readableOn(primary) : palette.muted,
        ...(t === "corporate"
          ? { backgroundColor: primary, paddingVertical: 5, paddingHorizontal: 6 }
          : { borderBottomWidth: t === "bold" ? 2 : 1, borderBottomColor: t === "editorial" ? rule : palette.ink, paddingBottom: 5 }),
      },
      tr: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: rule, paddingVertical: 6, ...(t === "corporate" ? { paddingHorizontal: 6 } : {}) },
      trAlt: { backgroundColor: palette.band },
      cName: { flexGrow: 1, flexBasis: 0, paddingRight: 8 },
      cQty: { width: 52, textAlign: "right" },
      cPrice: { width: 66, textAlign: "right" },
      cVat: { width: 38, textAlign: "right" },
      cTotal: { width: 78, textAlign: "right" },
      lineName: { fontWeight: fonts.body === "CQInter" ? 600 : 400, ...(t === "editorial" ? { fontFamily: "CQInstrument", fontWeight: 400, fontSize: 12, lineHeight: 1.3 } : {}) },
      lineDesc: { color: palette.muted, fontSize: 8.5 },
      tag: { color: palette.muted, fontSize: 7.5 },
      summaryWrap: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -5 },
      group: {
        flexGrow: 1,
        flexBasis: 160,
        margin: 5,
        padding: 10,
        borderWidth: t === "bold" ? 0 : 0.75,
        borderColor: t === "corporate" ? primary : rule,
        borderRadius: t === "corporate" ? 0 : 5,
        ...(t === "bold" ? { backgroundColor: palette.boldInk, color: palette.white } : {}),
      },
      groupTitle: { fontSize: 7, textTransform: "uppercase", letterSpacing: 1, color: t === "bold" ? "#BDBAC4" : palette.muted, marginBottom: 4 },
      row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
      rowStrong: { marginTop: 4, paddingTop: 6, borderTopWidth: 0.75, borderTopColor: t === "bold" ? "#3A3842" : rule, fontSize: 11.5, fontWeight: fonts.body === "CQInter" ? 700 : 400 },
      strongValue: { color: t === "bold" ? accent : palette.ink },
      notice: { fontSize: 7.5, color: palette.muted, marginTop: 4 },
      parties: { flexDirection: "row" },
      party: { flexGrow: 1, flexBasis: 0, paddingRight: 16 },
      partyName: { fontWeight: fonts.body === "CQInter" ? 600 : 400, fontSize: 10.5, marginBottom: 2 },
      figure: { marginBottom: 18 },
      figureImage: { width: "100%", maxHeight: 320, objectFit: "cover", borderRadius: 3 },
      watermark: { position: "absolute", top: 18, right: 48, fontSize: 7.5, letterSpacing: 1.4, textTransform: "uppercase", color: palette.muted },
    }),
  };
}

type Ctx = ReturnType<typeof styles> & { snapshot: QuoteSnapshot; fonts: Fonts; images: Map<string, { mime: string; data: Buffer }> };

function imageSource(entry: { mime: string; data: Buffer } | undefined) {
  if (!entry) return null;
  if (entry.mime === "image/png") return { data: entry.data, format: "png" as const };
  if (entry.mime === "image/jpeg") return { data: entry.data, format: "jpg" as const };
  return null;
}

function Logo({ ctx }: { ctx: Ctx }) {
  const logo = ctx.snapshot.brand.logo;
  const source = logo ? imageSource({ mime: logo.mime, data: Buffer.from(logo.dataBase64, "base64") }) : null;
  // SVG logos cannot be embedded as vector here: the company name stands in.
  // eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image, not an HTML img
  if (source) return <Image src={source} style={ctx.sheet.logo} />;
  return <Text style={ctx.sheet.logoText}>{ctx.snapshot.issuer.displayName}</Text>;
}

function Cover({ ctx, block }: { ctx: Ctx; block: BlockOf<"cover"> }) {
  const { snapshot, sheet } = ctx;
  const image = block.imageAssetId ? imageSource(ctx.images.get(block.imageAssetId)) : null;
  const issuer = issuerLines(snapshot.issuer);
  const meta: Array<[string, string]> = [
    ["Per", snapshot.client?.name ?? "Cliente da scegliere"],
    ["Data", formatLongDate(snapshot.quote.issuedAt) ?? ""],
  ];
  const until = formatLongDate(snapshot.quote.validUntil);
  if (until) meta.push(["Valido fino al", until]);
  return (
    <View style={sheet.cover}>
      {snapshot.template === "bold" ? <View style={sheet.boldCircle} fixed /> : null}
      <View style={sheet.coverHead}>
        <Logo ctx={ctx} />
        <View style={sheet.numberBox}>
          <Text style={[sheet.small, snapshot.template === "corporate" ? { color: readableOn(ctx.primary) } : {}]}>Preventivo</Text>
          <Text style={sheet.numberText}>{snapshot.quote.number ?? "Senza numero"}</Text>
        </View>
      </View>
      {snapshot.template === "corporate" && issuer.length ? <Text style={sheet.issuerBand}>{issuer.join("   ·   ")}</Text> : null}
      <View style={sheet.coverMain}>
        <Text style={sheet.kicker}>Proposta commerciale</Text>
        <Text style={sheet.title}>{block.title.trim() || snapshot.quote.title}</Text>
        {block.subtitle.trim() ? <Text style={sheet.subtitle}>{block.subtitle}</Text> : null}
        {snapshot.template === "bold" ? (
          <View>
            <Text style={sheet.coverTotalLabel}>Investimento</Text>
            <Text style={sheet.coverTotal}>{headlineTotal(snapshot.totals)}</Text>
          </View>
        ) : null}
      </View>
      {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image */}
      {image ? <Image src={image} style={sheet.coverImage} /> : snapshot.template === "bold" ? null : <View style={sheet.shape} />}
      <View style={sheet.meta}>
        {meta.map(([label, value]) => (
          <View key={label} style={sheet.metaItem}>
            <Text style={sheet.small}>{label}</Text>
            <Text style={sheet.metaValue}>{value}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function Heading({ ctx, index, children }: { ctx: Ctx; index: number; children: string }) {
  const numbered = ctx.snapshot.template === "corporate" || ctx.snapshot.template === "bold";
  return (
    <View style={ctx.sheet.h2Row} minPresenceAhead={60}>
      {numbered ? <Text style={ctx.sheet.index}>{String(index).padStart(2, "0")}</Text> : null}
      <Text style={ctx.sheet.h2}>{children}</Text>
    </View>
  );
}

function Paragraphs({ ctx, text }: { ctx: Ctx; text: string }) {
  return (
    <>
      {text
        .split(/\n{2,}/)
        .map((part) => part.trim())
        .filter(Boolean)
        .map((part, index) => (
          <Text key={index} style={ctx.sheet.paragraph}>
            {part}
          </Text>
        ))}
    </>
  );
}

function Lines({ ctx, lines }: { ctx: Ctx; lines: QuoteLine[] }) {
  const { sheet, snapshot } = ctx;
  const ordinario = snapshot.fiscal.taxProfile === "ordinario";
  if (lines.length === 0) return <Text style={sheet.muted}>Nessuna voce in questa sezione.</Text>;
  return (
    <View style={sheet.table}>
      <View style={sheet.th} fixed={false}>
        <Text style={sheet.cName}>Voce</Text>
        <Text style={sheet.cQty}>Qtà</Text>
        <Text style={sheet.cPrice}>Prezzo</Text>
        {ordinario ? <Text style={sheet.cVat}>IVA</Text> : null}
        <Text style={sheet.cTotal}>Imponibile</Text>
      </View>
      {lines.map((line, index) => {
        const tags = [
          line.billing !== "una_tantum" ? catalogBillingLabel[line.billing] : null,
          line.discountBp > 0 ? `Sconto ${formatPercentBp(line.discountBp)}` : null,
          line.priceMode === "gross" && ordinario ? "Prezzo IVA inclusa" : null,
        ].filter(Boolean);
        return (
          <View key={line.id} style={[sheet.tr, snapshot.template === "corporate" && index % 2 === 1 ? sheet.trAlt : {}]} wrap={false}>
            <View style={sheet.cName}>
              <Text style={sheet.lineName}>{line.name}</Text>
              {line.description.trim() ? <Text style={sheet.lineDesc}>{line.description}</Text> : null}
              {tags.length ? <Text style={sheet.tag}>{tags.join("  ·  ")}</Text> : null}
            </View>
            <Text style={sheet.cQty}>
              {formatQuantity(line.quantityMilli)}
              {line.unit ? ` ${line.unit}` : ""}
            </Text>
            <Text style={sheet.cPrice}>{formatEuro(line.unitPriceCents)}</Text>
            {ordinario ? <Text style={sheet.cVat}>{line.taxRateBp === 0 ? (line.taxNature ?? "0%") : formatPercentBp(line.taxRateBp)}</Text> : null}
            <View style={sheet.cTotal}>
              <Text>{formatEuro(lineNetCents(line, snapshot.fiscal.taxProfile))}</Text>
              {line.billing !== "una_tantum" ? <Text style={sheet.tag}>{billingSuffix(line.billing, line.periods).trim()}</Text> : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

function Summary({ ctx }: { ctx: Ctx }) {
  const { sheet, snapshot } = ctx;
  return (
    <View wrap={false}>
      <View style={sheet.summaryWrap}>
        {summaryGroups(snapshot.totals).map((group) => (
          <View key={group.title} style={sheet.group}>
            <Text style={sheet.groupTitle}>{group.title}</Text>
            {group.rows.map((row) => (
              <View key={row.label} style={[sheet.row, row.strong ? sheet.rowStrong : {}]}>
                <Text>{row.label}</Text>
                <Text style={row.strong ? sheet.strongValue : {}}>{row.value}</Text>
              </View>
            ))}
          </View>
        ))}
      </View>
      {snapshot.totals.main.notices.map((notice) => (
        <Text key={notice} style={sheet.notice}>
          {notice}
        </Text>
      ))}
    </View>
  );
}

function Block({ ctx, block, index }: { ctx: Ctx; block: QuoteBlock; index: number }): ReactNode {
  const { sheet, snapshot } = ctx;
  const title = (value: string) => value.trim() || blockLabel[block.type];
  switch (block.type) {
    case "cover":
      return null;
    case "intro":
    case "text":
    case "terms":
      return (
        <View style={sheet.section}>
          <Heading ctx={ctx} index={index}>
            {title(block.heading)}
          </Heading>
          <Paragraphs ctx={ctx} text={block.body} />
          {block.type === "terms" && !block.body.trim() ? <Text style={sheet.muted}>Nessuna condizione indicata.</Text> : null}
        </View>
      );
    case "image": {
      const source = block.assetId ? imageSource(ctx.images.get(block.assetId)) : null;
      if (!source) return null;
      return (
        <View style={sheet.figure} wrap={false}>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image */}
          <Image src={source} style={sheet.figureImage} />
          {block.caption.trim() ? <Text style={[sheet.muted, { fontSize: 8, marginTop: 4 }]}>{block.caption}</Text> : null}
        </View>
      );
    }
    case "services":
      return (
        <View style={sheet.section}>
          <Heading ctx={ctx} index={index}>
            {title(block.heading)}
          </Heading>
          <Lines ctx={ctx} lines={block.items} />
        </View>
      );
    case "options": {
      const label = optionsTotalLabel(snapshot.totals);
      return (
        <View style={sheet.section}>
          <Heading ctx={ctx} index={index}>
            {title(block.heading)}
          </Heading>
          <Paragraphs ctx={ctx} text={block.body} />
          <Lines ctx={ctx} lines={block.items} />
          {label ? <Text style={[sheet.notice, { marginTop: 6 }]}>Opzioni facoltative, escluse dal totale: {label} IVA inclusa.</Text> : null}
        </View>
      );
    }
    case "summary":
      return (
        <View style={sheet.section}>
          <Heading ctx={ctx} index={index}>
            {title(block.heading)}
          </Heading>
          <Summary ctx={ctx} />
          <Paragraphs ctx={ctx} text={block.body} />
        </View>
      );
    case "contacts": {
      const issuer = issuerLines(snapshot.issuer);
      const client = clientLines(snapshot.client);
      return (
        <View style={sheet.section} wrap={false}>
          <Heading ctx={ctx} index={index}>
            {title(block.heading)}
          </Heading>
          <Paragraphs ctx={ctx} text={block.body} />
          <View style={sheet.parties}>
            <View style={sheet.party}>
              <Text style={sheet.small}>Da</Text>
              <Text style={sheet.partyName}>{snapshot.issuer.displayName}</Text>
              {snapshot.issuer.ownerName ? <Text>Referente: {snapshot.issuer.ownerName}</Text> : null}
              {issuer.map((line) => (
                <Text key={line}>{line}</Text>
              ))}
            </View>
            <View style={sheet.party}>
              <Text style={sheet.small}>Per</Text>
              <Text style={sheet.partyName}>{snapshot.client?.name ?? "Cliente da scegliere"}</Text>
              {client.map((line) => (
                <Text key={line}>{line}</Text>
              ))}
            </View>
          </View>
        </View>
      );
    }
    default: {
      const exhaustive: never = block;
      return exhaustive;
    }
  }
}

export type PdfOptions = {
  images: Map<string, { mime: string; data: Buffer }>;
  /** Shown on every page of a draft so it is never mistaken for a frozen version. */
  watermark: string | null;
};

export async function renderQuotePdf(snapshot: QuoteSnapshot, options: PdfOptions): Promise<Buffer> {
  registerFonts();
  const fonts = fontsFor(snapshot);
  const ctx: Ctx = { ...styles(snapshot, fonts), snapshot, fonts, images: options.images };
  const visible = snapshot.document.blocks.filter((block) => block.visible);
  const cover = visible.find((block): block is BlockOf<"cover"> => block.type === "cover");
  const rest = visible.filter((block) => block.type !== "cover");
  const numbers = sectionNumbers(rest);
  const title = [snapshot.quote.number, snapshot.quote.title].filter(Boolean).join(" · ");
  const doc = (
    <Document title={title} author={snapshot.issuer.displayName} subject="Preventivo" creator="CTRL Quotes" producer="CTRL Quotes" language="it-IT">
      {cover ? (
        <Page size="A4" style={ctx.sheet.coverPage}>
          {options.watermark ? <Text style={ctx.sheet.watermark}>{options.watermark}</Text> : null}
          <Cover ctx={ctx} block={cover} />
        </Page>
      ) : null}
      <Page size="A4" style={ctx.sheet.page} wrap>
        <View style={ctx.sheet.running} fixed>
          <Text>{snapshot.issuer.displayName}</Text>
          <Text>{options.watermark ? `${title} · ${options.watermark}` : title}</Text>
        </View>
        {rest.map((block, position) => (
          <Block key={block.id} ctx={ctx} block={block} index={numbers[position] ?? 0} />
        ))}
        <View style={ctx.sheet.footer} fixed>
          <Text>{snapshot.issuer.displayName}</Text>
          <Text render={({ pageNumber, totalPages }) => `Pagina ${pageNumber} di ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
  return renderToBuffer(doc);
}

export function pdfFilename(snapshot: QuoteSnapshot, versionNo: number | null): string {
  const base = (snapshot.quote.number ?? "preventivo").replace(/[^\w.-]+/g, "-");
  return versionNo ? `${base}-v${versionNo}.pdf` : `${base}-bozza.pdf`;
}

