/**
 * Pagination pass for the PDF. react-pdf moves an element that must stay whole (a row of columns,
 * a chart, the conditions) to the next page when it does not fit, and that can leave half a page
 * empty. After a first render we read where everything landed and adjust a small print plan:
 *
 * - `stack`: a row of columns that jumped to the next page leaving a big gap prints its blocks one
 *   under the other instead, so the text can fill the gap. Kept only if the gap really shrinks.
 * - `tall`: an element that must stay whole but is taller than a page is allowed to break. react-pdf
 *   only warns about such an element (and squeezes or fails the page), so when that happens a probe
 *   render with every element allowed to break measures them.
 * - `fresh`: such a tall element that would start with just its title at the foot of a page
 *   starts on a new page instead.
 *
 * Pure functions on the layout tree, so they can be tested without rendering.
 */

/** Prop on react-pdf views with the id of the block (or row) they print. */
export const printTagProp = "cqPrint";
/** Prop on react-pdf pages with the template page label, the same on every page it overflows to. */
export const printPageProp = "cqPage";

import type { PrintPlan } from "@/components/quote-render/model";

export { emptyPlan, type PrintPlan } from "@/components/quote-render/model";

type LayoutBox = { top?: number; height?: number; paddingTop?: number; paddingBottom?: number };
export type LayoutNode = { type?: string; props?: Record<string, unknown> | null; box?: LayoutBox; style?: Record<string, unknown> | null; children?: LayoutNode[] };

export type PrintItem = { tag: string | null; top: number; bottom: number };
/** One printed page: the template page it belongs to, its content area and its flowing children. */
export type PrintPage = { label: string | null; top: number; bottom: number; items: PrintItem[] };

export function readPages(layout: LayoutNode | null | undefined): PrintPage[] {
  return (layout?.children ?? []).map((page) => {
    const box = page.box ?? {};
    const label = page.props?.[printPageProp];
    const items = (page.children ?? [])
      .filter((node) => node.box && node.props?.fixed !== true && node.style?.position !== "absolute")
      .map((node) => {
        const tag = node.props?.[printTagProp];
        const top = node.box?.top ?? 0;
        return { tag: typeof tag === "string" ? tag : null, top, bottom: top + (node.box?.height ?? 0) };
      });
    return { label: typeof label === "string" ? label : null, top: box.paddingTop ?? 0, bottom: (box.height ?? 0) - (box.paddingBottom ?? 0), items };
  });
}

/** Page `index + 1` is the same template page overflowing, not a new one. */
function continues(pages: PrintPage[], index: number): boolean {
  const page = pages[index];
  const next = pages[index + 1];
  return Boolean(page && next && page.label !== null && page.label === next.label);
}

/** Empty space left at the foot of each page that overflows to the next one. */
export function pageGaps(pages: PrintPage[]): Array<{ page: number; gap: number; next: PrintItem | null }> {
  const out: Array<{ page: number; gap: number; next: PrintItem | null }> = [];
  pages.forEach((page, index) => {
    if (!continues(pages, index)) return;
    const end = Math.max(page.top, ...page.items.map((item) => item.bottom));
    out.push({ page: index, gap: Math.max(0, page.bottom - end), next: pages[index + 1]?.items[0] ?? null });
  });
  return out;
}

/** Total empty space left by page breaks inside template pages. */
export function waste(pages: PrintPage[]): number {
  return pageGaps(pages).reduce((sum, entry) => sum + entry.gap, 0);
}

/** Rows that went whole to the next page leaving at least `minGap` pt empty behind them. */
export function jumpedRows(pages: PrintPage[], minGap: number): string[] {
  return pageGaps(pages)
    .filter((entry) => entry.gap >= minGap && entry.next?.tag?.startsWith("row:"))
    .map((entry) => entry.next?.tag as string);
}

/**
 * From a probe render (everything may break): the elements taller than the room a page offers.
 * Their height is the sum of their pieces; the room is the tallest stretch a page leaves below
 * its first element.
 */
export function tallTags(probe: PrintPage[]): string[] {
  const total = new Map<string, number>();
  for (const page of probe) for (const item of page.items) if (item.tag) total.set(item.tag, (total.get(item.tag) ?? 0) + (item.bottom - item.top));
  const rooms = probe.filter((page) => page.items.length).map((page) => page.bottom - (page.items[0]?.top ?? page.top));
  const room = rooms.length ? Math.max(...rooms) : Infinity;
  return [...total].filter(([, height]) => height > room - 1).map(([tag]) => tag);
}

/** The plan after a probe: tall rows print stacked, other tall elements may break. */
export function withTall(plan: PrintPlan, tags: string[]): PrintPlan {
  const rows = tags.filter((tag) => tag.startsWith("row:"));
  const rest = tags.filter((tag) => !tag.startsWith("row:"));
  return { ...plan, probe: false, stack: new Set([...plan.stack, ...rows]), tall: new Set([...plan.tall, ...rest]) };
}

/**
 * Elements of `among` that break across pages with less than `minHeight` pt on the first page
 * (a title and a line or two) while something else sits above them.
 */
export function orphans(pages: PrintPage[], among: ReadonlySet<string>, minHeight: number): string[] {
  const out: string[] = [];
  pages.forEach((page, index) => {
    const last = page.items[page.items.length - 1];
    if (!last?.tag || !among.has(last.tag) || page.items.length < 2) return;
    if (pages[index + 1]?.items[0]?.tag !== last.tag) return;
    if (last.bottom - last.top < minHeight) out.push(last.tag);
  });
  return out;
}

export type PlanStep = { plan: PrintPlan; trial: string | null };

/**
 * The next plan to try after a render, or null when nothing is left to improve. A forced step
 * (`trial: null`) moves a tall element that would start with just its title; a trial stacks one
 * jumped row and is kept by the caller only if it helps.
 */
export function nextStep(plan: PrintPlan, pages: PrintPage[], tried: ReadonlySet<string>, options: { minGap: number; minStart: number }): PlanStep | null {
  const fresh = orphans(pages, plan.tall, options.minStart).filter((tag) => !plan.fresh.has(tag));
  if (fresh.length) return { plan: { ...plan, fresh: new Set([...plan.fresh, ...fresh]) }, trial: null };
  const row = jumpedRows(pages, options.minGap).find((tag) => !tried.has(tag) && !plan.stack.has(tag));
  return row ? { plan: { ...plan, stack: new Set([...plan.stack, row]) }, trial: row } : null;
}

/** A trial is kept when it frees a real amount of space and adds no page. */
export function improves(before: PrintPage[], after: PrintPage[], minSaving: number): boolean {
  return after.length <= before.length && waste(after) <= waste(before) - minSaving;
}

/**
 * The page edges a break leaves bare. `top`: the block opening a page that its template page
 * overflowed onto (going on from the page before, or starting there). `bottom`: the block a break
 * cuts at the foot of a page. Keyed by printed page, 1-based.
 */
export function pageEdges(pages: PrintPage[]): Map<number, { top: string | null; bottom: string | null }> {
  const out = new Map<number, { top: string | null; bottom: string | null }>();
  pages.forEach((page, index) => {
    const first = page.items[0];
    const last = page.items[page.items.length - 1];
    const after = continues(pages, index) ? pages[index + 1]?.items[0] : undefined;
    const top = first?.tag && index > 0 && continues(pages, index - 1) ? first.tag : null;
    const bottom = last?.tag && after?.tag === last.tag ? last.tag : null;
    if (top || bottom) out.set(index + 1, { top, bottom });
  });
  return out;
}
