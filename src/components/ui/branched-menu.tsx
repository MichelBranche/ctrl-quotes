"use client";

import { isValidElement, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { Reorder, useDragControls, useReducedMotion, type DragControls } from "motion/react";
import "./branched-menu.css";

/**
 * Branched menu, after React Bits "BranchedMenu" (reactbits.dev, MIT): collapsible groups whose
 * children branch off a trunk with rounded elbows. The lines draw in when a group opens and the
 * group folds smoothly; a second line traces the way to the active item. Extended for the app:
 * controlled active item, row actions, optional reorder inside a group, light and dark themes
 * through CSS variables, reduced motion.
 */

export interface BranchedMenuChild {
  value: string;
  label: string;
  icon?: ReactNode | IconSvgElement;
  /** Small text after the label (e.g. a column width). */
  meta?: ReactNode;
  /** Dimmed row, e.g. a hidden block. */
  muted?: boolean;
  /** Cannot be dragged (e.g. the cover). */
  fixed?: boolean;
  title?: string;
}

export interface BranchedMenuItem {
  label: string;
  value?: string;
  children?: BranchedMenuChild[];
}

export interface BranchedMenuProps {
  items: BranchedMenuItem[];
  defaultOpen?: number | number[];
  defaultActive?: string;
  /** Controlled active value; its group opens by itself. */
  active?: string | null;
  onSelect?: (value: string, item: BranchedMenuChild | BranchedMenuItem) => void;
  onToggle?: (index: number, open: boolean) => void;
  /** Buttons at the end of a child row (shown on hover, focus and on the active row). */
  renderActions?: (child: BranchedMenuChild, group: number) => ReactNode;
  onChildContextMenu?: (child: BranchedMenuChild, event: ReactMouseEvent) => void;
  /** Enables drag to reorder inside a group. Called with the new order of the group values. */
  onReorder?: (group: number, values: string[], moved: string) => void;
  /** Keyboard reorder from the grip (arrow keys). */
  onMove?: (value: string, delta: -1 | 1) => void;
  color?: string;
  accentColor?: string;
  lineColor?: string;
  width?: number | string;
  rowHeight?: number;
  indent?: number;
  trunk?: number;
  radius?: number;
  lineWidth?: number;
  fontSize?: number;
  drawDuration?: number;
  foldDuration?: number;
  className?: string;
  "aria-label"?: string;
}

const PAD = 6;
const MARK = 16;

const renderIcon = (icon: ReactNode | IconSvgElement) => (isValidElement(icon) ? icon : <HugeiconsIcon icon={icon as IconSvgElement} size={16} strokeWidth={1.8} />);
const toSet = (open: number | number[]) => new Set(Array.isArray(open) ? open : open >= 0 ? [open] : []);

export function BranchedMenu({
  items,
  defaultOpen = 0,
  defaultActive = "",
  active: controlled,
  onSelect,
  onToggle,
  renderActions,
  onChildContextMenu,
  onReorder,
  onMove,
  color,
  accentColor,
  lineColor,
  width = 240,
  rowHeight = 36,
  indent = 40,
  trunk = 14,
  radius = 10,
  lineWidth = 1.5,
  fontSize = 14,
  drawDuration = 400,
  foldDuration = 300,
  className = "",
  "aria-label": ariaLabel,
}: BranchedMenuProps) {
  const [open, setOpen] = useState<Set<number>>(() => toSet(defaultOpen));
  const [own, setOwn] = useState(defaultActive);
  const active = controlled === undefined ? own : (controlled ?? "");
  const [live, setLive] = useState<{ group: number; values: string[] } | null>(null);
  const liveRef = useRef<{ group: number; values: string[]; moved: string } | null>(null);
  const reduced = useReducedMotion();
  const navRef = useRef<HTMLElement>(null);
  const heads = useRef<(HTMLButtonElement | null)[]>([]);
  const markerRef = useRef<HTMLSpanElement>(null);

  const activeSection = items.findIndex((item) => item.children?.some((kid) => kid.value === active));
  // The group of the active item opens by itself (a selection made on the sheet).
  const [seen, setSeen] = useState(active);
  if (seen !== active) {
    setSeen(active);
    if (activeSection >= 0 && !open.has(activeSection)) setOpen((prev) => new Set(prev).add(activeSection));
  }
  const markerShown = activeSection >= 0 && open.has(activeSection);

  useLayoutEffect(() => {
    const place = (glide: boolean) => {
      const marker = markerRef.current;
      const head = heads.current[activeSection];
      if (!marker) return;
      const on = markerShown && head;
      if (!glide) marker.style.transition = "none";
      if (on) marker.style.top = `${head.offsetTop + (head.offsetHeight - MARK) / 2}px`;
      marker.toggleAttribute("data-on", Boolean(on));
      if (!glide) {
        void marker.offsetHeight;
        marker.style.transition = "";
      }
    };
    place(true);
    let first = true;
    const observer = new ResizeObserver(() => {
      if (first) {
        first = false;
        return;
      }
      place(false);
    });
    if (navRef.current) observer.observe(navRef.current);
    return () => observer.disconnect();
  }, [activeSection, markerShown, items, fontSize, rowHeight]);

  const select = (value: string, item: BranchedMenuChild | BranchedMenuItem) => {
    setOwn(value);
    onSelect?.(value, item);
  };
  const toggle = (index: number) => {
    const isOpen = !open.has(index);
    setOpen((prev) => {
      const next = new Set(prev);
      if (isOpen) next.add(index);
      else next.delete(index);
      return next;
    });
    onToggle?.(index, isOpen);
  };

  const r = Math.min(radius, rowHeight / 2 - 2);
  const endX = indent - 8;
  const rowY = (k: number) => PAD + k * rowHeight + rowHeight / 2;
  const branch = (k: number) => `M ${trunk} ${rowY(k) - r} A ${r} ${r} 0 0 0 ${trunk + r} ${rowY(k)} H ${endX}`;
  const reach = (k: number) => `M ${trunk} 0 V ${rowY(k) - r} A ${r} ${r} 0 0 0 ${trunk + r} ${rowY(k)} H ${endX}`;

  return (
    <nav
      ref={navRef}
      aria-label={ariaLabel}
      className={`branched-menu${reduced ? " is-reduced" : ""}${className ? ` ${className}` : ""}`}
      style={
        {
          "--bm-w": typeof width === "number" ? `${width}px` : width,
          ...(color ? { "--bm-ink": color } : {}),
          ...(accentColor ? { "--bm-accent": accentColor } : {}),
          ...(lineColor ? { "--bm-line": lineColor } : {}),
          "--bm-font": `${fontSize}px`,
          "--bm-row": `${rowHeight}px`,
          "--bm-indent": `${indent}px`,
          "--bm-line-w": lineWidth,
          "--bm-draw": `${drawDuration}ms`,
          "--bm-fold": `${foldDuration}ms`,
        } as CSSProperties
      }
    >
      <span ref={markerRef} className="branched-menu__marker" aria-hidden="true" />
      {items.map((item, index) => {
        const base = item.children;
        const kids = base && live?.group === index ? (live.values.map((value) => base.find((kid) => kid.value === value)).filter(Boolean) as BranchedMenuChild[]) : base;
        const isOpen = kids ? open.has(index) : false;
        const leafValue = item.value ?? item.label;
        const leafActive = !kids && leafValue === active;
        const bodyHeight = kids ? PAD * 2 + kids.length * rowHeight : 0;
        const trunkLength = kids && kids.length ? rowY(kids.length - 1) - r : 0;
        return (
          <div key={`${index}:${item.value ?? item.label}`} className="branched-menu__section" data-open={isOpen ? "" : undefined}>
            <button
              ref={(element) => {
                heads.current[index] = element;
              }}
              type="button"
              className="branched-menu__head"
              aria-expanded={kids ? isOpen : undefined}
              aria-current={leafActive ? "true" : undefined}
              data-active={leafActive ? "" : undefined}
              onClick={() => (kids ? toggle(index) : select(leafValue, item))}
            >
              {item.label}
            </button>
            {kids ? (
              <div className="branched-menu__body" inert={!isOpen || undefined}>
                <div className="branched-menu__fold">
                  <div className="branched-menu__tree" style={{ height: bodyHeight }}>
                    <svg className="branched-menu__lines" width={indent} height={bodyHeight} aria-hidden="true">
                      {kids.length ? <path className="branched-menu__base" pathLength={1} d={`M ${trunk} 0 V ${trunkLength}`} /> : null}
                      {kids.map((kid, k) => (
                        <path key={kid.value} className="branched-menu__base" pathLength={1} d={branch(k)} />
                      ))}
                      {kids.map((kid, k) => (
                        <path key={`r-${kid.value}`} className="branched-menu__reach" pathLength={1} d={reach(k)} data-on={kid.value === active && isOpen ? "" : undefined} />
                      ))}
                    </svg>
                    <Reorder.Group
                      as="ul"
                      axis="y"
                      className="branched-menu__list"
                      values={kids.map((kid) => kid.value)}
                      onReorder={(values: string[]) => {
                        if (!onReorder) return;
                        // Fixed rows keep their place.
                        if (kids.some((kid, k) => kid.fixed && values[k] !== kid.value)) return;
                        liveRef.current = { group: index, values, moved: liveRef.current?.moved ?? "" };
                        setLive({ group: index, values });
                      }}
                    >
                      {kids.map((kid, k) => (
                        <Row
                          key={kid.value}
                          kid={kid}
                          active={kid.value === active}
                          focusable={isOpen}
                          draggable={Boolean(onReorder) && !kid.fixed}
                          reduced={Boolean(reduced)}
                          first={k === 0 || Boolean(kids[k - 1]?.fixed)}
                          last={k === kids.length - 1}
                          actions={renderActions?.(kid, index)}
                          onSelect={() => select(kid.value, kid)}
                          onContextMenu={onChildContextMenu ? (event) => onChildContextMenu(kid, event) : undefined}
                          onHold={() => {
                            liveRef.current = { group: index, values: kids.map((entry) => entry.value), moved: kid.value };
                          }}
                          onDrop={() => {
                            const next = liveRef.current;
                            liveRef.current = null;
                            setLive(null);
                            if (next && base && next.values.join() !== base.map((entry) => entry.value).join()) onReorder?.(next.group, next.values, kid.value);
                          }}
                          onMove={onMove ? (delta) => onMove(kid.value, delta) : undefined}
                        />
                      ))}
                    </Reorder.Group>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        );
      })}
    </nav>
  );
}

function Row({
  kid,
  active,
  focusable,
  draggable,
  reduced,
  first,
  last,
  actions,
  onSelect,
  onContextMenu,
  onHold,
  onDrop,
  onMove,
}: {
  kid: BranchedMenuChild;
  active: boolean;
  focusable: boolean;
  draggable: boolean;
  reduced: boolean;
  first: boolean;
  last: boolean;
  actions: ReactNode;
  onSelect: () => void;
  onContextMenu?: (event: ReactMouseEvent) => void;
  onHold: () => void;
  onDrop: () => void;
  onMove?: (delta: -1 | 1) => void;
}) {
  const controls = useDragControls();
  const [dragging, setDragging] = useState(false);
  return (
    <Reorder.Item
      as="li"
      value={kid.value}
      dragListener={false}
      dragControls={controls}
      layout="position"
      transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 560, damping: 44 }}
      whileDrag={reduced ? undefined : { scale: 1.02, zIndex: 3 }}
      onDragStart={() => setDragging(true)}
      onDragEnd={() => {
        setDragging(false);
        onDrop();
      }}
      className="branched-menu__row"
      data-dragging={dragging ? "" : undefined}
      data-active={active ? "" : undefined}
      data-muted={kid.muted ? "" : undefined}
      data-value={kid.value}
      onContextMenu={onContextMenu}
    >
      <Grip controls={controls} enabled={draggable} label={kid.label} first={first} last={last} focusable={focusable} onHold={onHold} onMove={onMove} />
      <button
        type="button"
        className="branched-menu__item"
        aria-current={active ? "true" : undefined}
        data-active={active ? "" : undefined}
        tabIndex={focusable ? 0 : -1}
        title={kid.title}
        onClick={onSelect}
      >
        {kid.icon ? (
          <span className="branched-menu__icon" aria-hidden="true">
            {renderIcon(kid.icon)}
          </span>
        ) : null}
        <span className="branched-menu__label">{kid.label}</span>
        {kid.meta ? <span className="branched-menu__meta">{kid.meta}</span> : null}
      </button>
      {actions ? <span className="branched-menu__actions">{actions}</span> : null}
    </Reorder.Item>
  );
}

function Grip({
  controls,
  enabled,
  label,
  first,
  last,
  focusable,
  onHold,
  onMove,
}: {
  controls: DragControls;
  enabled: boolean;
  label: string;
  first: boolean;
  last: boolean;
  focusable: boolean;
  onHold: () => void;
  onMove?: (delta: -1 | 1) => void;
}) {
  // A press that never becomes a drag still ends the hold.
  const [held, setHeld] = useState(false);
  useEffect(() => {
    if (!held) return;
    const up = () => setHeld(false);
    window.addEventListener("pointerup", up);
    return () => window.removeEventListener("pointerup", up);
  }, [held]);
  if (!enabled) return <span className="branched-menu__grip is-off" aria-hidden="true" />;
  return (
    <button
      type="button"
      className="branched-menu__grip"
      aria-label={`Sposta ${label}: trascina, oppure frecce su e giù`}
      title="Trascina per riordinare"
      tabIndex={focusable ? 0 : -1}
      onPointerDown={(event) => {
        event.preventDefault();
        setHeld(true);
        onHold();
        controls.start(event);
      }}
      onKeyDown={(event) => {
        if (event.key === "ArrowUp" && !first) {
          event.preventDefault();
          onMove?.(-1);
        } else if (event.key === "ArrowDown" && !last) {
          event.preventDefault();
          onMove?.(1);
        }
      }}
    >
      <svg width="8" height="12" viewBox="0 0 8 12" aria-hidden="true">
        {[2, 6, 10].map((y) => (
          <g key={y}>
            <circle cx="2" cy={y} r="1" />
            <circle cx="6" cy={y} r="1" />
          </g>
        ))}
      </svg>
    </button>
  );
}
