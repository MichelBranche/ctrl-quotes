"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { motion, useMotionValue, useSpring, type MotionValue } from "motion/react";
import type { QuoteBlock } from "@/domain/quote-document";
import { blockElements, type BlockBox } from "./geometry";

export type DragView = {
  id: string;
  /** Where the block lands, in canvas content coordinates. */
  region: { x: number; y: number; w: number; h: number };
  /** Document order if the block is released now. */
  order: string[];
  /** Released now, the block goes side by side with this one instead of moving between rows. */
  join?: { targetId: string; side: "before" | "after" };
};

type Item = { id: string; el: HTMLElement; top: number; bottom: number; left: number; right: number; page: number };

/** Share of a block's width, on each side, where a drop means "side by side" instead of "above or below". */
export const JOIN_EDGE = 0.22;

/** Which edge of which block the pointer is on, if any (content coordinates). */
export function joinTarget(items: Array<Pick<Item, "id" | "top" | "bottom" | "left" | "right">>, x: number, y: number, canJoin: (targetId: string) => boolean): DragView["join"] | null {
  for (const item of items) {
    if (y < item.top || y > item.bottom || x < item.left || x > item.right) continue;
    const width = item.right - item.left;
    if (width <= 0) return null;
    const share = (x - item.left) / width;
    const side = share < JOIN_EDGE ? "before" : share > 1 - JOIN_EDGE ? "after" : null;
    return side && canJoin(item.id) ? { targetId: item.id, side } : null;
  }
  return null;
}

type Session = {
  id: string;
  pointerId: number;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  origin: DOMRect;
  source: Item;
  box: BlockBox;
  others: Item[];
  s: number;
  gap: number;
  slot: number;
  k: number;
  join: DragView["join"] | null;
};

export type Ghost = { left: number; top: number; width: number; clone: HTMLElement; background: string; color: string; zoom: number };

const EASE = "cubic-bezier(0.2, 0.8, 0.2, 1)";
const THRESHOLD = 4;

function translate(element: HTMLElement, px: number, zoom: number) {
  // Blocks live inside the zoomed sheets: a CSS length there is multiplied by the zoom.
  element.style.transform = px ? `translateY(${px / zoom}px)` : "";
}

/**
 * Vertical reordering on the sheet. The block lifts and follows the pointer freely (a clone in a
 * fixed layer), the others slide to open a gap where it would land, a line marks the slot, and on
 * release the document is reordered and every block glides to its new place (FLIP).
 */
export function useBlockDrag({
  contentRef,
  scrollRef,
  zoom,
  blocks,
  boxes,
  pausedRef,
  reduced,
  measure,
  onCommit,
  onSettled,
  canJoin,
  onJoin,
}: {
  contentRef: React.RefObject<HTMLDivElement | null>;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  zoom: number;
  blocks: QuoteBlock[];
  boxes: BlockBox[];
  pausedRef: React.RefObject<boolean>;
  reduced: boolean;
  measure: () => void;
  onCommit: (order: string[]) => boolean;
  onSettled: (id: string) => void;
  /** Whether the dragged block may go side by side with a target (allowed types, room in the row). */
  canJoin?: (id: string, targetId: string) => boolean;
  /** Puts the dragged block next to the target; false when refused. */
  onJoin?: (id: string, targetId: string, side: "before" | "after") => boolean;
}) {
  const rawX = useMotionValue(0);
  const rawY = useMotionValue(0);
  const spring = reduced ? { stiffness: 2000, damping: 120, mass: 0.2 } : { stiffness: 700, damping: 52, mass: 0.6 };
  const x = useSpring(rawX, spring);
  const y = useSpring(rawY, spring);
  const [ghost, setGhost] = useState<Ghost | null>(null);
  const [lifted, setLifted] = useState(false);
  const [view, setView] = useState<DragView | null>(null);
  const [settle, setSettle] = useState<{ id: string; tops: Map<string, number> } | null>(null);
  const session = useRef<Session | null>(null);
  const pending = useRef<{ id: string; pointerId: number; x: number; y: number } | null>(null);
  const frame = useRef(0);
  const latest = useRef({ zoom, blocks, boxes, measure, onCommit, onSettled, canJoin, onJoin });
  useEffect(() => {
    latest.current = { zoom, blocks, boxes, measure, onCommit, onSettled, canJoin, onJoin };
  });

  const shiftOf = (current: Session, index: number, k: number) => (k <= index && index < current.s ? current.slot : current.s <= index && index < k ? -current.slot : 0);

  const regionOf = (current: Session, k: number) => {
    const { others, gap, source, box } = current;
    const height = source.bottom - source.top;
    if (others.length === 0) return { x: box.x, y: source.top, w: box.w, h: height };
    if (k < others.length) {
      const next = others[k] as Item;
      const bottom = next.top + shiftOf(current, k, k) - gap;
      return { x: box.x, y: bottom - height, w: box.w, h: height };
    }
    const last = others[others.length - 1] as Item;
    return { x: box.x, y: last.bottom + shiftOf(current, others.length - 1, k) + gap, w: box.w, h: height };
  };

  const orderFor = (current: Session, k: number) => {
    const ids = latest.current.blocks.map((block) => block.id).filter((id) => id !== current.id);
    const before = current.others[k]?.id;
    const after = current.others[k - 1]?.id;
    let at = before ? ids.indexOf(before) : after ? ids.indexOf(after) + 1 : ids.length;
    if (at < 0) at = ids.length;
    ids.splice(at, 0, current.id);
    return ids;
  };

  const target = (current: Session) => {
    const content = contentRef.current;
    if (!content) return;
    const rect = content.getBoundingClientRect();
    const probe = current.lastY - rect.top;
    const { canJoin: allowJoin } = latest.current;
    const join = allowJoin ? joinTarget(current.others, current.lastX - rect.left, probe, (targetId) => allowJoin(current.id, targetId)) : null;
    if (join) {
      if (current.join?.targetId === join.targetId && current.join.side === join.side) return;
      current.join = join;
      current.k = -1;
      current.others.forEach((item) => translate(item.el, 0, latest.current.zoom));
      const item = current.others.find((entry) => entry.id === join.targetId) as Item;
      const x = join.side === "before" ? item.left : item.right;
      setView({ id: current.id, region: { x: x - 2, y: item.top, w: 4, h: item.bottom - item.top }, order: latest.current.blocks.map((block) => block.id), join });
      return;
    }
    let k = 0;
    for (const item of current.others) if ((item.top + item.bottom) / 2 < probe) k += 1;
    if (k === current.k && view && !current.join) return;
    current.join = null;
    current.k = k;
    current.others.forEach((item, index) => translate(item.el, shiftOf(current, index, k), latest.current.zoom));
    setView({ id: current.id, region: regionOf(current, k), order: orderFor(current, k) });
  };

  const stopLoop = () => cancelAnimationFrame(frame.current);

  const loop = () => {
    const current = session.current;
    const scroll = scrollRef.current;
    if (!current || !scroll) return;
    const rect = scroll.getBoundingClientRect();
    // Near an edge the canvas scrolls, slowly at first and faster as the pointer goes further.
    const edge = 56;
    const speed = (depth: number) => Math.ceil(Math.min(1, depth / edge) ** 2 * 18);
    let delta = 0;
    if (current.lastY < rect.top + edge) delta = -speed(rect.top + edge - current.lastY);
    else if (current.lastY > rect.bottom - edge) delta = speed(current.lastY - (rect.bottom - edge));
    if (delta) {
      scroll.scrollTop += delta;
      target(current);
    }
    frame.current = requestAnimationFrame(loop);
  };

  const cleanup = (items: Item[]) => {
    for (const item of items) {
      item.el.style.transition = "";
      item.el.style.willChange = "";
    }
    document.body.classList.remove("ve-grabbing");
  };

  const finish = (id: string) => {
    window.setTimeout(
      () => {
        const content = contentRef.current;
        const element = content ? blockElements(content).get(id) : undefined;
        if (element) element.style.opacity = "";
        setGhost(null);
        setView(null);
        pausedRef.current = false;
        latest.current.measure();
        latest.current.onSettled(id);
      },
      reduced ? 60 : 380,
    );
  };

  const cancel = () => {
    const current = session.current;
    session.current = null;
    stopLoop();
    if (!current) return;
    for (const item of current.others) translate(item.el, 0, latest.current.zoom);
    setLifted(false);
    rawX.set(0);
    rawY.set(0);
    window.setTimeout(() => cleanup([current.source, ...current.others]), 300);
    finish(current.id);
  };

  const drop = () => {
    const current = session.current;
    if (!current) return;
    if (current.join) {
      const { targetId, side } = current.join;
      session.current = null;
      stopLoop();
      for (const item of current.others) translate(item.el, 0, latest.current.zoom);
      cleanup([current.source, ...current.others]);
      current.source.el.style.opacity = "";
      latest.current.onJoin?.(current.id, targetId, side);
      setLifted(false);
      rawX.set(0);
      rawY.set(0);
      finish(current.id);
      return;
    }
    const order = orderFor(current, current.k);
    const unchanged = order.join() === latest.current.blocks.map((block) => block.id).join();
    if (unchanged) {
      cancel();
      return;
    }
    session.current = null;
    stopLoop();
    const tops = new Map<string, number>();
    for (const item of [current.source, ...current.others]) tops.set(item.id, item.el.getBoundingClientRect().top);
    for (const item of [current.source, ...current.others]) {
      item.el.style.transition = "none";
      item.el.style.transform = "";
      item.el.style.opacity = "";
    }
    cleanup([current.source, ...current.others]);
    if (!latest.current.onCommit(order)) {
      setLifted(false);
      rawX.set(0);
      rawY.set(0);
      finish(current.id);
      return;
    }
    setSettle({ id: current.id, tops });
  };

  // After the reorder renders: the dragged block lands where the ghost glides, the others slide in.
  useLayoutEffect(() => {
    if (!settle) return;
    const content = contentRef.current;
    if (!content) return;
    const elements = blockElements(content);
    const moved: HTMLElement[] = [];
    const scale = latest.current.zoom;
    for (const [id, top] of settle.tops) {
      const element = elements.get(id);
      if (!element) continue;
      if (id === settle.id) {
        element.style.opacity = "0";
        continue;
      }
      const delta = top - element.getBoundingClientRect().top;
      if (Math.abs(delta) < 0.5) continue;
      element.style.transition = "none";
      translate(element, delta, scale);
      moved.push(element);
    }
    void content.offsetHeight;
    const landing = elements.get(settle.id)?.getBoundingClientRect();
    // Not cancelled when settle resets below: that re-render must not stop the landing.
    requestAnimationFrame(() => {
      for (const element of moved) {
        element.style.transition = reduced ? "none" : `transform 280ms ${EASE}`;
        element.style.transform = "";
      }
      if (landing && ghost) {
        rawX.set(landing.left - ghost.left);
        rawY.set(landing.top - ghost.top);
      }
      setLifted(false);
      window.setTimeout(() => {
        for (const element of moved) element.style.transition = "";
      }, 320);
    });
    const id = settle.id;
    setSettle(null);
    finish(id);
    // Runs once per drop; the rest is read from refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settle]);

  const begin = (id: string, pointerId: number, startX: number, startY: number) => {
    const content = contentRef.current;
    if (!content) return;
    const { boxes: currentBoxes, blocks: currentBlocks, zoom: scale } = latest.current;
    const types = new Map(currentBlocks.map((block) => [block.id, block.type]));
    const elements = blockElements(content);
    const items: Item[] = [];
    let box: BlockBox | null = null;
    for (const entry of currentBoxes) {
      const element = elements.get(entry.id);
      if (!element || types.get(entry.id) === "cover") continue;
      items.push({ id: entry.id, el: element, top: entry.y, bottom: entry.y + entry.h, left: entry.x, right: entry.x + entry.w, page: entry.page });
      if (entry.id === id) box = entry;
    }
    const s = items.findIndex((item) => item.id === id);
    const source = items[s];
    if (!source || !box) return;
    const next = items[s + 1];
    const previous = items[s - 1];
    const gap = Math.max(0, next && next.page === source.page ? next.top - source.bottom : previous && previous.page === source.page ? source.top - previous.bottom : 16 * scale);
    const others = items.filter((item) => item.id !== id);
    const origin = source.el.getBoundingClientRect();

    const clone = source.el.cloneNode(true) as HTMLElement;
    clone.style.opacity = "";
    clone.style.transform = "";
    clone.style.margin = "0";
    clone.style.width = `${origin.width / scale}px`;
    for (const anchored of clone.querySelectorAll("[data-block-id]")) anchored.removeAttribute("data-block-id");
    clone.removeAttribute("data-block-id");
    const page = source.el.closest(".k-page");
    const pageStyle = page ? getComputedStyle(page) : null;
    const background = pageStyle && pageStyle.backgroundColor !== "rgba(0, 0, 0, 0)" ? pageStyle.backgroundColor : "#ffffff";

    pausedRef.current = true;
    session.current = { id, pointerId, startX, startY, lastX: startX, lastY: startY, origin, source, box, others, s, gap, slot: origin.height + gap, k: s, join: null };
    rawX.jump(0);
    rawY.jump(0);
    x.jump(0);
    y.jump(0);
    setGhost({ left: origin.left, top: origin.top, width: origin.width, clone, background, color: pageStyle?.color ?? "inherit", zoom: scale });
    setLifted(true);
    source.el.style.opacity = "0";
    for (const item of others) {
      item.el.style.willChange = "transform";
      item.el.style.transition = reduced ? "none" : `transform 220ms ${EASE}`;
    }
    document.body.classList.add("ve-grabbing");
    setView({ id, region: { x: box.x, y: source.top, w: box.w, h: origin.height }, order: latest.current.blocks.map((block) => block.id) });
    frame.current = requestAnimationFrame(loop);
  };

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const waiting = pending.current;
      if (waiting && event.pointerId === waiting.pointerId) {
        if (Math.hypot(event.clientX - waiting.x, event.clientY - waiting.y) < THRESHOLD) return;
        pending.current = null;
        begin(waiting.id, waiting.pointerId, waiting.x, waiting.y);
      }
      const current = session.current;
      if (!current || event.pointerId !== current.pointerId) return;
      event.preventDefault();
      current.lastX = event.clientX;
      current.lastY = event.clientY;
      rawX.set(event.clientX - current.startX);
      rawY.set(event.clientY - current.startY);
      target(current);
    };
    const onUp = (event: PointerEvent) => {
      if (pending.current?.pointerId === event.pointerId) pending.current = null;
      if (session.current?.pointerId === event.pointerId) {
        if (event.type === "pointercancel") cancel();
        else drop();
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && session.current) {
        event.preventDefault();
        event.stopPropagation();
        cancel();
      }
    };
    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      window.removeEventListener("keydown", onKey, true);
    };
  });

  const start = useCallback((event: React.PointerEvent, id: string) => {
    if (event.button !== 0) return;
    event.preventDefault();
    pending.current = { id, pointerId: event.pointerId, x: event.clientX, y: event.clientY };
  }, []);

  return { start, ghost, lifted, view, x, y, dragging: ghost !== null };
}

/** The lifted copy of the block, following the pointer with a soft shadow. */
export function DragGhost({ ghost, lifted, x, y, reduced }: { ghost: Ghost; lifted: boolean; x: MotionValue<number>; y: MotionValue<number>; reduced: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const node = host.current;
    if (!node) return;
    node.replaceChildren(ghost.clone);
    return () => node.replaceChildren();
  }, [ghost.clone]);
  return (
    <motion.div
      className="ve-ghost"
      aria-hidden="true"
      style={{ left: ghost.left, top: ghost.top, width: ghost.width, x, y, background: ghost.background, color: ghost.color }}
      initial={{ scale: 1, rotate: 0, boxShadow: "0 1px 2px rgb(15 15 30 / 0.06), 0 6px 16px -8px rgb(15 15 30 / 0.18)" }}
      animate={
        lifted
          ? { scale: reduced ? 1 : 1.015, rotate: reduced ? 0 : -0.5, boxShadow: "0 2px 6px rgb(15 15 30 / 0.06), 0 28px 60px -18px rgb(30 20 80 / 0.35)" }
          : { scale: 1, rotate: 0, boxShadow: "0 1px 2px rgb(15 15 30 / 0.04), 0 4px 10px -6px rgb(15 15 30 / 0.12)" }
      }
      transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 32 }}
    >
      <div ref={host} style={{ zoom: ghost.zoom } as React.CSSProperties} />
    </motion.div>
  );
}
