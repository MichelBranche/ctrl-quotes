"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, useReducedMotion } from "motion/react";
import { ChevronRight, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { typeahead } from "./menu-model";

export type MenuEntry =
  | { kind: "item"; id: string; label: string; icon?: LucideIcon; keys?: string; danger?: boolean; disabled?: boolean; note?: string; hint?: string }
  | { kind: "submenu"; id: string; label: string; icon?: LucideIcon; disabled?: boolean; note?: string; entries: MenuEntry[] }
  | { kind: "group"; id: string; label: string }
  | { kind: "separator"; id: string };

type Actionable = Extract<MenuEntry, { kind: "item" } | { kind: "submenu" }>;
const actionable = (entry: MenuEntry): entry is Actionable => (entry.kind === "item" || entry.kind === "submenu") && !entry.disabled;

const MARGIN = 8;

/** Keeps a menu of the given size inside the viewport: flips up from the bottom edge and left from the right one. */
export function clampMenu(point: { x: number; y: number }, size: { w: number; h: number }, viewport: { w: number; h: number }, flipFrom?: number) {
  let x = point.x;
  if (x + size.w > viewport.w - MARGIN) x = flipFrom !== undefined ? flipFrom - size.w : viewport.w - MARGIN - size.w;
  let y = point.y;
  if (y + size.h > viewport.h - MARGIN) {
    // Opens upward from the pointer when it fits, otherwise it sits on the bottom edge.
    const up = point.y - size.h;
    y = flipFrom === undefined && up >= MARGIN ? up : viewport.h - MARGIN - size.h;
  }
  return { x: Math.max(MARGIN, x), y: Math.max(MARGIN, y) };
}

function MenuList({
  entries,
  label,
  point,
  flipFrom,
  head,
  foot,
  depth,
  autoFocus = true,
  onClose,
  onBack,
  onDone,
}: {
  entries: MenuEntry[];
  label: string;
  point: { x: number; y: number };
  flipFrom?: number;
  head?: React.ReactNode;
  foot?: React.ReactNode;
  depth: number;
  autoFocus?: boolean;
  onClose: () => void;
  onBack?: () => void;
  onDone: (id: string) => void;
}) {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const items = useRef(new Map<string, HTMLElement>());
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [open, setOpen] = useState<{ id: string; x: number; y: number; left: number; focus: boolean } | null>(null);
  const typed = useRef({ query: "", at: 0 });
  const hoverTimer = useRef<number | undefined>(undefined);

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    setPosition(clampMenu(point, { w: node.offsetWidth, h: node.offsetHeight }, { w: window.innerWidth, h: window.innerHeight }, flipFrom));
  }, [point, flipFrom]);

  const focusItem = useCallback((id: string | undefined) => {
    if (!id) return;
    setActive(id);
    items.current.get(id)?.focus({ preventScroll: true });
  }, []);

  // The first item takes focus once, when the menu is placed (or when a hovered submenu is entered
  // from the keyboard). Later renders never pull focus back from a submenu.
  const placed = position !== null;
  const focused = useRef(false);
  useEffect(() => {
    if (!placed || !autoFocus || focused.current) return;
    focused.current = true;
    focusItem(entries.find(actionable)?.id);
  }, [placed, autoFocus, entries, focusItem]);

  useEffect(() => () => window.clearTimeout(hoverTimer.current), []);

  const openSub = (entry: Actionable, focus: boolean) => {
    if (entry.kind !== "submenu") return;
    const node = items.current.get(entry.id);
    const rect = node?.getBoundingClientRect();
    if (!rect) return;
    setOpen({ id: entry.id, x: rect.right + 2, y: rect.top - 6, left: rect.left - 2, focus });
  };

  const activate = (entry: Actionable) => {
    if (entry.kind === "submenu") openSub(entry, true);
    else {
      onDone(entry.id);
    }
  };

  const move = (delta: number) => {
    const list = entries.filter(actionable);
    if (!list.length) return;
    const at = list.findIndex((entry) => entry.id === active);
    const next = list[(at + delta + list.length) % list.length];
    focusItem(next?.id);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    const list = entries.filter(actionable);
    const current = list.find((entry) => entry.id === active);
    switch (event.key) {
      case "ArrowDown":
        move(1);
        break;
      case "ArrowUp":
        move(-1);
        break;
      case "Home":
        focusItem(list[0]?.id);
        break;
      case "End":
        focusItem(list[list.length - 1]?.id);
        break;
      case "ArrowRight":
        if (current?.kind === "submenu") openSub(current, true);
        break;
      case "ArrowLeft":
        if (onBack) onBack();
        break;
      case "Enter":
      case " ":
        if (current) activate(current);
        break;
      case "Escape":
        if (onBack) onBack();
        else onClose();
        break;
      case "Tab":
        onClose();
        break;
      default: {
        if (event.key.length !== 1 || event.ctrlKey || event.metaKey || event.altKey) return;
        const now = event.timeStamp;
        typed.current = { query: now - typed.current.at > 700 ? event.key : typed.current.query + event.key, at: now };
        const labels = list.map((entry) => entry.label);
        const at = Math.max(0, list.findIndex((entry) => entry.id === active));
        const start = typed.current.query.length > 1 ? at - 1 : at;
        focusItem(list[typeahead(labels, (start + labels.length) % labels.length, typed.current.query)]?.id);
      }
    }
    event.preventDefault();
    event.stopPropagation();
  };

  const sub = open ? entries.find((entry) => entry.id === open.id) : undefined;

  return (
    <>
      <motion.div
        ref={ref}
        role="menu"
        aria-label={label}
        aria-orientation="vertical"
        className={cn("ve-menu", depth > 0 && "is-sub")}
        data-ve-ui=""
        style={{ left: position?.x ?? point.x, top: position?.y ?? point.y, visibility: position ? "visible" : "hidden" }}
        initial={reduced ? false : { opacity: 0, scale: 0.97, y: depth ? 0 : -4, x: depth ? -4 : 0 }}
        animate={{ opacity: 1, scale: 1, y: 0, x: 0 }}
        transition={{ duration: 0.14, ease: [0.16, 1, 0.3, 1] }}
        onKeyDown={onKeyDown}
        onContextMenu={(event) => event.preventDefault()}
      >
        {head}
        {entries.map((entry) => {
          if (entry.kind === "separator") return <div key={entry.id} role="separator" className="ve-menu-sep" />;
          if (entry.kind === "group") return <div key={entry.id} role="presentation" className="ve-menu-group">{entry.label}</div>;
          const Icon = entry.icon;
          const expanded = open?.id === entry.id;
          return (
            <button
              key={entry.id}
              ref={(node) => {
                if (node) items.current.set(entry.id, node);
                else items.current.delete(entry.id);
              }}
              type="button"
              role="menuitem"
              tabIndex={active === entry.id ? 0 : -1}
              aria-disabled={entry.disabled || undefined}
              aria-haspopup={entry.kind === "submenu" ? "menu" : undefined}
              aria-expanded={entry.kind === "submenu" ? expanded : undefined}
              className={cn("ve-menu-item", entry.kind === "item" && entry.danger && "is-danger", (active === entry.id || expanded) && "is-active")}
              onFocus={() => {
                if (!entry.disabled) setActive(entry.id);
              }}
              onPointerEnter={() => {
                if (entry.disabled) return;
                setActive(entry.id);
                items.current.get(entry.id)?.focus({ preventScroll: true });
                window.clearTimeout(hoverTimer.current);
                if (entry.kind === "submenu") hoverTimer.current = window.setTimeout(() => openSub(entry, false), 90);
                else if (open) hoverTimer.current = window.setTimeout(() => setOpen(null), 160);
              }}
              onClick={() => {
                if (!entry.disabled) activate(entry);
              }}
            >
              <span className="ve-menu-icon" aria-hidden="true">{Icon ? <Icon size={15} /> : null}</span>
              <span className="ve-menu-label">
                {entry.label}
                {entry.kind === "item" && entry.hint ? <small>{entry.hint}</small> : null}
              </span>
              {entry.note ? <span className="ve-menu-note">{entry.note}</span> : null}
              {entry.kind === "item" && entry.keys ? <kbd className="ve-menu-kbd">{entry.keys}</kbd> : null}
              {entry.kind === "submenu" ? <ChevronRight size={14} className="ve-menu-chevron" aria-hidden="true" /> : null}
            </button>
          );
        })}
        {foot}
      </motion.div>
      {open && sub?.kind === "submenu" ? (
        <MenuList
          key={open.id}
          entries={sub.entries}
          label={sub.label}
          point={{ x: open.x, y: open.y }}
          flipFrom={open.left}
          depth={depth + 1}
          autoFocus={open.focus}
          onClose={onClose}
          onDone={onDone}
          onBack={() => {
            setOpen(null);
            focusItem(sub.id);
          }}
        />
      ) : null}
    </>
  );
}

/**
 * The editor's right click menu: a real ARIA menu with arrows, Enter, Esc, ArrowRight for submenus
 * and type-ahead. Closes on a click elsewhere, the mouse wheel, resize or when the window loses focus,
 * and gives focus back to whatever had it.
 */
export function ContextMenu({
  point,
  label,
  entries,
  head,
  foot,
  onAction,
  onClose,
}: {
  point: { x: number; y: number };
  label: string;
  entries: MenuEntry[];
  head?: React.ReactNode;
  foot?: React.ReactNode;
  /** The chosen item's id; the menu is already closing. */
  onAction: (id: string) => void;
  onClose: () => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const layer = root.current;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const inside = (target: EventTarget | null) => target instanceof Node && Boolean(layer?.contains(target));
    const onPointer = (event: PointerEvent) => {
      if (!inside(event.target)) onClose();
    };
    // Scrolling by hand closes it; a smooth scroll the editor started itself does not.
    const onScroll = (event: Event) => {
      if (!inside(event.target)) onClose();
    };
    const onBlur = () => onClose();
    const onResize = () => onClose();
    document.addEventListener("pointerdown", onPointer, true);
    document.addEventListener("wheel", onScroll, { capture: true, passive: true });
    window.addEventListener("blur", onBlur);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("pointerdown", onPointer, true);
      document.removeEventListener("wheel", onScroll, { capture: true });
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("resize", onResize);
      // Give focus back unless the chosen action already moved it somewhere useful.
      const lost = !document.activeElement || document.activeElement === document.body || Boolean(layer?.contains(document.activeElement));
      if (lost && previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, [onClose]);

  // Only ever opened by a user gesture, so there is always a document to portal into.
  return createPortal(
    <div ref={root} className="ve-menu-layer">
      <MenuList entries={entries} label={label} point={point} head={head} foot={foot} depth={0} onClose={onClose} onDone={(id) => {
        onClose();
        onAction(id);
      }} />
    </div>,
    document.body,
  );
}
