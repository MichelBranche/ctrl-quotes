"use client";

import { cloneElement, useEffect, useId, type CSSProperties, type ReactElement, type ReactNode } from "react";

const GAP = 8;
const EDGE = 8;

function supportsCssAnchor(): boolean {
  return typeof CSS !== "undefined" && (CSS.supports("top: anchor(bottom)") || CSS.supports("position-area: bottom"));
}

function place(popover: HTMLElement, trigger: HTMLElement, align: "start" | "end") {
  const rect = trigger.getBoundingClientRect();
  const width = popover.offsetWidth;
  const height = popover.offsetHeight;
  const viewW = window.innerWidth;
  const viewH = window.innerHeight;

  let top = rect.bottom + GAP;
  if (top + height > viewH - EDGE) {
    const above = rect.top - height - GAP;
    top = above >= EDGE ? above : Math.max(EDGE, viewH - height - EDGE);
  }

  let left = align === "end" ? rect.right - width : rect.left;
  if (left + width > viewW - EDGE) left = Math.max(EDGE, viewW - width - EDGE);
  if (left < EDGE) left = EDGE;

  popover.style.top = `${Math.round(top)}px`;
  popover.style.left = `${Math.round(left)}px`;
  popover.style.right = "auto";
  popover.style.bottom = "auto";
}

type Trigger = ReactElement<{ popoverTarget?: string; style?: CSSProperties }>;

/** Native popover anchored to its trigger, with a layout fallback when CSS anchors are missing. */
export function AnchoredPopover({
  id,
  align = "end",
  trigger,
  children,
}: {
  id: string;
  align?: "start" | "end";
  trigger: Trigger;
  children: ReactNode;
}) {
  const reactId = useId();
  const anchorName = `--${id.replace(/[^a-zA-Z0-9_-]/g, "") || "popover"}-${reactId.replace(/:/g, "")}`;

  useEffect(() => {
    if (supportsCssAnchor()) return;
    const popover = document.getElementById(id);
    const triggerEl = document.querySelector(`[popovertarget="${id}"]`);
    if (!(popover instanceof HTMLElement) || !(triggerEl instanceof HTMLElement)) return;

    const onToggle = (event: Event) => {
      const toggle = event as ToggleEvent;
      if (toggle.newState !== "open") return;
      place(popover, triggerEl, align);
    };
    const onReposition = () => {
      if (!popover.matches(":popover-open")) return;
      place(popover, triggerEl, align);
    };
    popover.addEventListener("toggle", onToggle);
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);
    return () => {
      popover.removeEventListener("toggle", onToggle);
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
  }, [id, align]);

  return (
    <>
      {cloneElement(trigger, {
        popoverTarget: id,
        style: { ...trigger.props.style, anchorName } as CSSProperties,
      })}
      <div id={id} popover="auto" className={`popover popover-${align}`} style={{ positionAnchor: anchorName } as CSSProperties}>
        {children}
      </div>
    </>
  );
}
