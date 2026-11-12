import { createHash } from "node:crypto";
import { inflateSync } from "node:zlib";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Kit } from "@/components/quote-render/kit";
import { IdScopeProvider, SheetProvider } from "@/components/quote-render/kit-web";
import { buildModel, type Resources } from "@/components/quote-render/model";
import { renderers } from "@/components/quote-render/templates";
import type { QuoteSnapshot } from "@/domain/quote-snapshot";
import { photoUrl } from "@/domain/templates";

const sha = (data: Buffer | string) => createHash("sha256").update(data).digest("hex");

/**
 * Content fingerprint of a PDF, stable across runs and zlib builds: every stream is inflated and
 * hashed, lengths, dates, file ids and random font subset prefixes are neutralised.
 */
export function pdfFingerprint(pdf: Buffer): string {
  const text = pdf.toString("latin1");
  const parts: string[] = [];
  let cursor = 0;
  const marker = /stream\r?\n/g;
  let match: RegExpExecArray | null;
  while ((match = marker.exec(text))) {
    if (text.slice(match.index - 3, match.index) === "end") continue;
    const start = match.index + match[0].length;
    const end = text.indexOf("endstream", start);
    if (end < 0) break;
    parts.push(text.slice(cursor, match.index));
    let raw = pdf.subarray(start, end);
    while (raw.length && (raw[raw.length - 1] === 0x0a || raw[raw.length - 1] === 0x0d)) raw = raw.subarray(0, raw.length - 1);
    let body: Buffer;
    try {
      body = inflateSync(raw);
    } catch {
      body = raw;
    }
    parts.push(`stream:${sha(body.toString("latin1").replace(/\/[A-Z]{6}\+/g, "/SUBSET+"))}`);
    cursor = end + "endstream".length;
    marker.lastIndex = cursor;
  }
  parts.push(text.slice(cursor));
  const skeleton = parts
    .join("")
    .replace(/\/Length \d+/g, "/Length 0")
    .replace(/\(D:[^)]*\)/g, "(D:0)")
    .replace(/\/ID \[<[0-9a-fA-F]+> ?<[0-9a-fA-F]+>\]/g, "/ID []")
    .replace(/\/[A-Z]{6}\+/g, "/SUBSET+")
    // Object offsets in the xref table follow the compressed lengths: drop the table.
    .replace(/xref[\s\S]*?trailer/g, "xref trailer")
    .replace(/startxref\s+\d+/g, "startxref 0");
  return sha(skeleton);
}

/** Static HTML of a template rendered with a given kit, as the editor preview prints it. */
export function webMarkup(snapshot: QuoteSnapshot, kit: Kit): string {
  const renderer = renderers[snapshot.template];
  const resources: Resources = {
    logo: null,
    photo: (key, option, slot) => photoUrl(key, option, slot),
    image: (assetId) => `/api/assets/${assetId}`,
    watermark: "Bozza",
    versionLabel: "Bozza",
  };
  const pages: ReactElement[] = renderer.render(kit, buildModel(snapshot, resources, renderer.numbering));
  return renderToStaticMarkup(
    <IdScopeProvider scope="qdtest">
      {pages.map((page, index) => (
        <SheetProvider key={index} index={index + 1} total={pages.length}>
          {page}
        </SheetProvider>
      ))}
    </IdScopeProvider>,
  );
}

export const fingerprint = sha;
