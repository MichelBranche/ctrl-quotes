import type { BlockType, QuoteBlock } from "@/domain/quote-document";

/**
 * Blocks side by side: a flat list where consecutive blocks with the same `col.row` form a row.
 * Widths are in sixths of the content width (2 = 1/3, 3 = 1/2, 4 = 2/3) and always add up to 6.
 * `normalizeColumns` keeps these rules after every command, so a broken row can never be stored.
 */

export type Span = 2 | 3 | 4;
export type BlockColumn = { row: string; span: Span };

/** Block types that can sit in a column (v1). Tables, cover, Riepilogo, Tempistiche and signature stay full width. */
export const columnTypes: ReadonlySet<BlockType> = new Set<BlockType>(["text", "image", "highlights", "terms", "chartCosts", "chartBars", "chartTimeline", "chartPayments"]);
export const maxColumns = 3;

export function canColumn(type: BlockType): boolean {
  return columnTypes.has(type);
}

/** Width layouts a row may use, by number of columns. */
export const rowLayouts: Record<2 | 3, Span[][]> = {
  2: [
    [3, 3],
    [2, 4],
    [4, 2],
  ],
  3: [[2, 2, 2]],
};

export function validLayout(spans: number[]): spans is Span[] {
  const options = spans.length === 2 || spans.length === 3 ? rowLayouts[spans.length] : [];
  return options.some((option) => option.every((span, index) => span === spans[index]));
}

/** The closest valid layout to some widths that no longer fit (a column left, a copy joined). */
export function fitLayout(spans: number[]): Span[] {
  if (validLayout(spans)) return spans;
  if (spans.length >= 3) return [2, 2, 2];
  const [a = 3, b = 3] = spans;
  return a === b ? [3, 3] : a < b ? [2, 4] : [4, 2];
}

/** Human label of a width, e.g. "1/3". */
export function spanLabel(span: number): string {
  return span === 2 ? "1/3" : span === 3 ? "1/2" : span === 4 ? "2/3" : `${span}/6`;
}

export type RowGroup = { row: string; start: number; blocks: QuoteBlock[] };
export type Unit = { kind: "block"; block: QuoteBlock; start: number } | ({ kind: "row" } & RowGroup);

/** The document as printed units: single blocks and rows, in order. Assumes normalized columns. */
export function unitsOf(blocks: QuoteBlock[]): Unit[] {
  const units: Unit[] = [];
  blocks.forEach((block, index) => {
    const previous = units[units.length - 1];
    if (block.col && previous?.kind === "row" && previous.row === block.col.row) {
      previous.blocks.push(block);
      return;
    }
    units.push(block.col ? { kind: "row", row: block.col.row, start: index, blocks: [block] } : { kind: "block", block, start: index });
  });
  return units;
}

/** The row a block belongs to, with its members in order. Null for a full width block. */
export function rowOf(blocks: QuoteBlock[], blockId: string): RowGroup | null {
  for (const unit of unitsOf(blocks)) if (unit.kind === "row" && unit.blocks.some((block) => block.id === blockId)) return unit;
  return null;
}

function withoutCol(block: QuoteBlock): QuoteBlock {
  const copy = { ...block };
  delete copy.col;
  return copy;
}

/**
 * Restores the row rules: only allowed types, members next to each other (a second run of the same
 * id becomes its own row), at most three columns, widths adding up to 6, no row of one. Returns the
 * same array when nothing changes, so documents without rows stay identical.
 */
export function normalizeColumns(blocks: QuoteBlock[]): QuoteBlock[] {
  if (!blocks.some((block) => block.col)) return blocks;
  const out: QuoteBlock[] = blocks.map((block) => (block.col && !canColumn(block.type) ? withoutCol(block) : block));
  // Runs of consecutive blocks with the same row id.
  const runs: Array<{ row: string; indexes: number[] }> = [];
  out.forEach((block, index) => {
    const last = runs[runs.length - 1];
    if (block.col && last && last.row === block.col.row && last.indexes[last.indexes.length - 1] === index - 1) last.indexes.push(index);
    else if (block.col) runs.push({ row: block.col.row, indexes: [index] });
  });
  const used = new Set<string>();
  for (const run of runs) {
    let row = run.row;
    for (let n = 2; used.has(row); n += 1) row = `${run.row.slice(0, 56)}-${n}`;
    used.add(row);
    const members = run.indexes.slice(0, maxColumns);
    for (const index of run.indexes.slice(maxColumns)) out[index] = withoutCol(out[index] as QuoteBlock);
    if (members.length < 2) {
      for (const index of members) out[index] = withoutCol(out[index] as QuoteBlock);
      continue;
    }
    const spans = fitLayout(members.map((index) => out[index]?.col?.span ?? 3));
    members.forEach((index, position) => {
      const block = out[index] as QuoteBlock;
      const span = spans[position] as Span;
      if (block.col?.row !== row || block.col.span !== span) out[index] = { ...block, col: { row, span } };
    });
  }
  return out.every((block, index) => block === blocks[index]) ? blocks : out;
}

/** Equal widths for a row of n columns. */
export function evenLayout(count: number): Span[] {
  return count >= 3 ? [2, 2, 2] : [3, 3];
}

/**
 * Printed widths of the visible columns, in percent: a hidden column leaves the print and the
 * others grow in proportion.
 */
export function printedWidths(spans: number[]): number[] {
  const total = spans.reduce((sum, span) => sum + span, 0) || 1;
  return spans.map((span) => Math.round((span / total) * 10000) / 100);
}

/** Index of the printed unit (block or row) that holds a block, and how many units there are. */
export function unitIndex(blocks: QuoteBlock[], blockId: string): { at: number; count: number } {
  const units = unitsOf(blocks);
  const at = units.findIndex((unit) => (unit.kind === "row" ? unit.blocks.some((block) => block.id === blockId) : unit.block.id === blockId));
  return { at, count: units.length };
}

/** Layouts offered for a row of n columns, with their labels ("1/3 + 2/3"). */
export function layoutChoices(count: number): Array<{ spans: Span[]; label: string }> {
  const options = count === 2 || count === 3 ? rowLayouts[count] : [];
  return options.map((spans) => ({ spans, label: spans.map(spanLabel).join(" + ") }));
}
