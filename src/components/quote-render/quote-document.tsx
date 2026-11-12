import type { CSSProperties, ReactNode } from "react";
import { fontStack, readableOn } from "@/domain/brand";
import { catalogBillingLabel } from "@/domain/catalog";
import { formatEuro } from "@/domain/money";
import {
  blockLabel,
  formatPercentBp,
  formatQuantity,
  lineNetCents,
  type BlockOf,
  type QuoteBlock,
  type QuoteLine,
} from "@/domain/quote-document";
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
import { cn } from "@/lib/cn";

/**
 * The single HTML renderer of a quote. Editor preview, full preview and (in phase 4) the public page
 * all use it; only the surrounding controls change. Every user value is printed as a text node.
 */
export type QuoteDocumentProps = {
  snapshot: QuoteSnapshot;
  /** Resolves an image asset id to a URL the current viewer can load. */
  imageSrc: (assetId: string) => string | null;
  logoSrc: string | null;
  watermark?: string | null;
  /** Highlights the block selected in the editor. */
  activeBlockId?: string | null;
  className?: string;
};

export function QuoteDocumentView({ snapshot, imageSrc, logoSrc, watermark, activeBlockId, className }: QuoteDocumentProps) {
  const { brand, template } = snapshot;
  const style = {
    "--qd-primary": brand.colorPrimary,
    "--qd-on-primary": readableOn(brand.colorPrimary),
    "--qd-accent": brand.colorSecondary,
    "--qd-on-accent": readableOn(brand.colorSecondary),
    "--qd-tint": brand.colorBackground,
    "--qd-font-heading": fontStack[brand.fontHeading],
    "--qd-font-body": fontStack[brand.fontBody],
  } as CSSProperties;
  const visible = snapshot.document.blocks.filter((block) => block.visible);
  const cover = visible.find((block): block is BlockOf<"cover"> => block.type === "cover");
  const rest = visible.filter((block) => block.type !== "cover");
  const numbers = sectionNumbers(rest);
  return (
    <div className={cn("qd", `qd-${template}`, className)} style={style} data-template={template}>
      {watermark ? (
        <div className="qd-watermark" aria-hidden="true">
          {watermark}
        </div>
      ) : null}
      {cover ? (
        <section className={cn("qd-page qd-cover-page", activeBlockId === cover.id && "is-active")} data-block-id={cover.id}>
          <Cover snapshot={snapshot} block={cover} imageSrc={imageSrc} logoSrc={logoSrc} />
        </section>
      ) : null}
      <section className="qd-page qd-body-page">
        {!cover ? <RunningHeader snapshot={snapshot} logoSrc={logoSrc} /> : null}
        {rest.map((block, position) => {
          const section = numbers[position] ?? 0;
          return (
            <div key={block.id} className={cn("qd-block", `qd-block-${block.type}`, activeBlockId === block.id && "is-active")} data-block-id={block.id}>
              <Block snapshot={snapshot} block={block} index={section} imageSrc={imageSrc} />
            </div>
          );
        })}
        <footer className="qd-footer">
          <span>{snapshot.issuer.displayName}</span>
          <span>{snapshot.quote.number ?? "Preventivo"}</span>
        </footer>
      </section>
    </div>
  );
}

function Logo({ snapshot, logoSrc }: { snapshot: QuoteSnapshot; logoSrc: string | null }) {
  return logoSrc ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img className="qd-logo" src={logoSrc} alt={snapshot.issuer.displayName} />
  ) : (
    <span className="qd-logo-text">{snapshot.issuer.displayName}</span>
  );
}

function RunningHeader({ snapshot, logoSrc }: { snapshot: QuoteSnapshot; logoSrc: string | null }) {
  return (
    <header className="qd-running">
      <Logo snapshot={snapshot} logoSrc={logoSrc} />
      <span>{[snapshot.quote.number, snapshot.quote.title].filter(Boolean).join(" · ")}</span>
    </header>
  );
}

function Meta({ snapshot }: { snapshot: QuoteSnapshot }) {
  const items: Array<{ label: string; value: string }> = [
    { label: "Per", value: snapshot.client?.name ?? "Cliente da scegliere" },
    { label: "Data", value: formatLongDate(snapshot.quote.issuedAt) ?? "" },
  ];
  const until = formatLongDate(snapshot.quote.validUntil);
  if (until) items.push({ label: "Valido fino al", value: until });
  return (
    <dl className="qd-meta">
      {items.map((item) => (
        <div key={item.label}>
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Cover({
  snapshot,
  block,
  imageSrc,
  logoSrc,
}: {
  snapshot: QuoteSnapshot;
  block: BlockOf<"cover">;
  imageSrc: (id: string) => string | null;
  logoSrc: string | null;
}) {
  const title = block.title.trim() || snapshot.quote.title;
  const image = block.imageAssetId ? imageSrc(block.imageAssetId) : null;
  const issuer = issuerLines(snapshot.issuer);
  return (
    <div className={cn("qd-cover", image && "has-image")}>
      <header className="qd-cover-head">
        <Logo snapshot={snapshot} logoSrc={logoSrc} />
        <div className="qd-cover-number">
          <small>Preventivo</small>
          <strong>{snapshot.quote.number ?? "Senza numero"}</strong>
        </div>
      </header>
      {snapshot.template === "corporate" && issuer.length ? (
        <p className="qd-cover-issuer">{issuer.join("  ·  ")}</p>
      ) : null}
      <div className="qd-cover-main">
        <small className="qd-kicker">Proposta commerciale</small>
        <h2 className="qd-title">{title}</h2>
        {block.subtitle.trim() ? <p className="qd-subtitle">{block.subtitle}</p> : null}
        {snapshot.template === "bold" ? (
          <p className="qd-cover-total">
            <small>Investimento</small>
            <strong>{headlineTotal(snapshot.totals)}</strong>
          </p>
        ) : null}
      </div>
      {image ? (
        <figure className="qd-cover-image">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image} alt="" />
        </figure>
      ) : (
        <i className="qd-cover-shape" aria-hidden="true" />
      )}
      <Meta snapshot={snapshot} />
    </div>
  );
}

function Heading({ index, children, snapshot }: { index: number; children: ReactNode; snapshot: QuoteSnapshot }) {
  return (
    <h3 className="qd-h2">
      {snapshot.template === "corporate" || snapshot.template === "bold" ? (
        <span className="qd-index">{String(index).padStart(2, "0")}</span>
      ) : null}
      <span>{children}</span>
    </h3>
  );
}

function Paragraphs({ text }: { text: string }) {
  const parts = text
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 0) return null;
  return (
    <div className="qd-text">
      {parts.map((part, index) => (
        <p key={index}>{part}</p>
      ))}
    </div>
  );
}

function Block({
  snapshot,
  block,
  index,
  imageSrc,
}: {
  snapshot: QuoteSnapshot;
  block: QuoteBlock;
  index: number;
  imageSrc: (id: string) => string | null;
}) {
  const title = (fallback: string, value: string) => value.trim() || fallback;
  switch (block.type) {
    case "cover":
      return null;
    case "intro":
    case "text":
    case "terms":
      return (
        <div className="qd-section">
          <Heading index={index} snapshot={snapshot}>
            {title(blockLabel[block.type], block.heading)}
          </Heading>
          <Paragraphs text={block.body} />
          {block.type === "terms" && !block.body.trim() ? <p className="qd-muted">Nessuna condizione indicata.</p> : null}
        </div>
      );
    case "image": {
      const src = block.assetId ? imageSrc(block.assetId) : null;
      return src ? (
        <figure className="qd-figure">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={block.alt} />
          {block.caption.trim() ? <figcaption>{block.caption}</figcaption> : null}
        </figure>
      ) : (
        <p className="qd-muted qd-placeholder">Immagine non ancora caricata.</p>
      );
    }
    case "services":
      return (
        <div className="qd-section">
          <Heading index={index} snapshot={snapshot}>
            {title("Servizi", block.heading)}
          </Heading>
          <LineTable lines={block.items} snapshot={snapshot} />
        </div>
      );
    case "options": {
      const label = optionsTotalLabel(snapshot.totals);
      return (
        <div className="qd-section">
          <Heading index={index} snapshot={snapshot}>
            {title("Opzioni", block.heading)}
          </Heading>
          <Paragraphs text={block.body} />
          <LineTable lines={block.items} snapshot={snapshot} optional />
          {label ? <p className="qd-options-note">Opzioni facoltative, escluse dal totale: {label} IVA inclusa.</p> : null}
        </div>
      );
    }
    case "summary":
      return (
        <div className="qd-section">
          <Heading index={index} snapshot={snapshot}>
            {title("Riepilogo", block.heading)}
          </Heading>
          <Summary snapshot={snapshot} />
          <Paragraphs text={block.body} />
        </div>
      );
    case "contacts": {
      const issuer = issuerLines(snapshot.issuer);
      const client = clientLines(snapshot.client);
      return (
        <div className="qd-section">
          <Heading index={index} snapshot={snapshot}>
            {title("Contatti", block.heading)}
          </Heading>
          <Paragraphs text={block.body} />
          <div className="qd-parties">
            <div>
              <small>Da</small>
              <strong>{snapshot.issuer.displayName}</strong>
              {snapshot.issuer.ownerName ? <span>Referente: {snapshot.issuer.ownerName}</span> : null}
              {issuer.map((line) => (
                <span key={line}>{line}</span>
              ))}
              {!snapshot.issuer.companyName ? (
                <span className="qd-muted">Completa i dati aziendali nel Brand Kit.</span>
              ) : null}
            </div>
            <div>
              <small>Per</small>
              <strong>{snapshot.client?.name ?? "Cliente da scegliere"}</strong>
              {client.map((line) => (
                <span key={line}>{line}</span>
              ))}
            </div>
          </div>
        </div>
      );
    }
    default: {
      const exhaustive: never = block;
      return exhaustive;
    }
  }
}

function LineTable({ lines, snapshot, optional = false }: { lines: QuoteLine[]; snapshot: QuoteSnapshot; optional?: boolean }) {
  if (lines.length === 0) return <p className="qd-muted qd-placeholder">Nessuna voce in questa sezione.</p>;
  const ordinario = snapshot.fiscal.taxProfile === "ordinario";
  return (
    <table className={cn("qd-table", optional && "is-optional")}>
      <thead>
        <tr>
          <th scope="col">Voce</th>
          <th scope="col" className="num">
            Qtà
          </th>
          <th scope="col" className="num">
            Prezzo
          </th>
          {ordinario ? (
            <th scope="col" className="num">
              IVA
            </th>
          ) : null}
          <th scope="col" className="num">
            Imponibile
          </th>
        </tr>
      </thead>
      <tbody>
        {lines.map((line) => {
          const suffix = billingSuffix(line.billing, line.periods);
          return (
            <tr key={line.id}>
              <td>
                <strong>{line.name}</strong>
                {line.description.trim() ? <span className="qd-line-desc">{line.description}</span> : null}
                <span className="qd-line-tags">
                  {line.billing !== "una_tantum" ? <em>{catalogBillingLabel[line.billing]}</em> : null}
                  {line.discountBp > 0 ? <em>Sconto {formatPercentBp(line.discountBp)}</em> : null}
                  {line.priceMode === "gross" && ordinario ? <em>Prezzo IVA inclusa</em> : null}
                </span>
              </td>
              <td className="num">
                {formatQuantity(line.quantityMilli)}
                {line.unit ? ` ${line.unit}` : ""}
              </td>
              <td className="num">{formatEuro(line.unitPriceCents)}</td>
              {ordinario ? <td className="num">{line.taxRateBp === 0 ? (line.taxNature ?? "0%") : formatPercentBp(line.taxRateBp)}</td> : null}
              <td className="num">
                {formatEuro(lineNetCents(line, snapshot.fiscal.taxProfile))}
                {suffix ? <span className="qd-suffix">{suffix}</span> : null}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function Summary({ snapshot }: { snapshot: QuoteSnapshot }) {
  const groups = summaryGroups(snapshot.totals);
  return (
    <div className="qd-summary">
      <div className="qd-summary-groups">
        {groups.map((group) => (
          <div key={group.title} className="qd-summary-group">
            <p className="qd-summary-title">{group.title}</p>
            <dl>
              {group.rows.map((row) => (
                <div key={row.label} className={cn("qd-summary-row", row.strong && "is-strong")}>
                  <dt>{row.label}</dt>
                  <dd>{row.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
      {snapshot.totals.main.notices.length ? (
        <ul className="qd-notices">
          {snapshot.totals.main.notices.map((notice) => (
            <li key={notice}>{notice}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
