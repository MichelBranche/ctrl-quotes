import type { QuoteDocument } from "@/domain/quote-document";

/**
 * Blocks that an undo or redo visibly touched: new or edited ones (a different object, since the model
 * never mutates), plus a moved block, recognised by having both neighbours changed.
 */
export function changedBlockIds(before: QuoteDocument, after: QuoteDocument): string[] {
  const previous = new Map(before.blocks.map((block, index) => [block.id, { block, index }]));
  const neighbours = (blocks: QuoteDocument["blocks"], index: number) => [blocks[index - 1]?.id ?? null, blocks[index + 1]?.id ?? null] as const;
  const changed: string[] = [];
  after.blocks.forEach((block, index) => {
    const old = previous.get(block.id);
    if (!old || old.block !== block) {
      changed.push(block.id);
      return;
    }
    const [wasBefore, wasAfter] = neighbours(before.blocks, old.index);
    const [isBefore, isAfter] = neighbours(after.blocks, index);
    if (wasBefore !== isBefore && wasAfter !== isAfter) changed.push(block.id);
  });
  return changed;
}
