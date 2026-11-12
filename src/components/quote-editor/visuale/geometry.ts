"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

/** A block printed on the sheet, in the coordinates of the canvas content (CSS px, zoom included). */
export type BlockBox = { id: string; x: number; y: number; w: number; h: number; page: number };
export type PageBox = { index: number; x: number; y: number; w: number; h: number };
export type Geometry = { blocks: BlockBox[]; pages: PageBox[]; version: number };

const empty: Geometry = { blocks: [], pages: [], version: 0 };

export function relativeRect(element: Element, content: Element) {
  const rect = element.getBoundingClientRect();
  const origin = content.getBoundingClientRect();
  return { x: rect.left - origin.left, y: rect.top - origin.top, w: rect.width, h: rect.height };
}

/** Top-level elements of each block, in page order: nested `data-block-id` elements are skipped. */
export function blockElements(content: Element): Map<string, HTMLElement> {
  const found = new Map<string, HTMLElement>();
  for (const element of content.querySelectorAll<HTMLElement>(".qd-sheets [data-block-id]")) {
    const id = element.dataset.blockId;
    if (!id || found.has(id)) continue;
    if (element.parentElement?.closest("[data-block-id]")) continue;
    found.set(id, element);
  }
  return found;
}

export function cssValue(value: string) {
  return typeof CSS !== "undefined" && CSS.escape ? CSS.escape(value) : value.replace(/[^\w.-]/g, "");
}

export function blockElement(content: Element | null, id: string): HTMLElement | null {
  return content?.querySelector<HTMLElement>(`.qd-sheets [data-block-id="${cssValue(id)}"]`) ?? null;
}

function same(a: Geometry, b: Omit<Geometry, "version">) {
  const round = (value: number) => Math.round(value * 2) / 2;
  const key = (geometry: Omit<Geometry, "version">) =>
    geometry.blocks.map((box) => `${box.id}:${round(box.x)}:${round(box.y)}:${round(box.w)}:${round(box.h)}:${box.page}`).join("|") +
    "#" +
    geometry.pages.map((page) => `${round(page.y)}:${round(page.h)}:${round(page.w)}`).join("|");
  return key(a) === key(b);
}

/**
 * Measures the printed blocks and pages after every render and whenever something changes size
 * (fonts, images, zoom). Paused while a drag owns the layout.
 */
export function useGeometry(contentRef: React.RefObject<HTMLDivElement | null>, order: string[], renderKey: unknown) {
  const [geometry, setGeometry] = useState<Geometry>(empty);
  const pausedRef = useRef(false);
  const orderRef = useRef(order);
  useEffect(() => {
    orderRef.current = order;
  });

  const measure = useCallback(() => {
    const content = contentRef.current;
    if (!content || pausedRef.current) return;
    const pages = [...content.querySelectorAll<HTMLElement>(".qd-sheets .k-page")];
    const pageBoxes: PageBox[] = pages.map((page, index) => ({ index, ...relativeRect(page, content) }));
    const elements = blockElements(content);
    const rank = new Map(orderRef.current.map((id, index) => [id, index]));
    const blocks: BlockBox[] = [];
    for (const [id, element] of elements) {
      const page = pages.findIndex((entry) => entry.contains(element));
      blocks.push({ id, page, ...relativeRect(element, content) });
    }
    blocks.sort((a, b) => (rank.get(a.id) ?? 999) - (rank.get(b.id) ?? 999));
    const next = { blocks, pages: pageBoxes };
    setGeometry((current) => (same(current, next) ? current : { ...next, version: current.version + 1 }));
  }, [contentRef]);

  useLayoutEffect(() => {
    measure();
  }, [measure, renderKey]);

  useEffect(() => {
    const content = contentRef.current;
    if (!content) return;
    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule);
    const sheets = content.querySelector(".qd-sheets");
    if (sheets && observer) {
      observer.observe(sheets);
      for (const page of sheets.querySelectorAll(".k-page")) observer.observe(page);
    }
    window.addEventListener("resize", schedule);
    content.addEventListener("load", schedule, true);
    void document.fonts?.ready.then(schedule);
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener("resize", schedule);
      content.removeEventListener("load", schedule, true);
    };
  }, [contentRef, measure, renderKey]);

  return { geometry, measure, pausedRef };
}

/** Scrolls the canvas just enough for a popover that opened near its edge to be fully visible. */
export function revealInCanvas(element: HTMLElement | null, reduced: boolean) {
  const scroll = element?.closest<HTMLElement>(".ve-canvas");
  if (!element || !scroll) return;
  const rect = element.getBoundingClientRect();
  const view = scroll.getBoundingClientRect();
  const margin = 16;
  let delta = 0;
  if (rect.bottom > view.bottom - margin) delta = rect.bottom - view.bottom + margin;
  if (rect.top - delta < view.top + margin) delta = rect.top - view.top - margin;
  if (Math.abs(delta) > 1) scroll.scrollBy({ top: delta, behavior: reduced ? "auto" : "smooth" });
}
