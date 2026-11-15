"use client";

import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useReducedMotion } from "motion/react";
import { Building2, CircleHelp, FileText, House, Layers, LayoutGrid, Settings, Users } from "lucide-react";
import { messages } from "@/i18n/it";

const primary = [
  { href: "/app/overview", label: messages.shell.overview, icon: House },
  { href: "/app/quotes", label: messages.shell.quotes, icon: FileText },
  { href: "/app/clients", label: messages.shell.clients, icon: Users },
  { href: "/app/catalog", label: messages.shell.catalog, icon: Layers },
  { href: "/app/workspace", label: messages.shell.workspace, icon: Building2 },
  { href: "/app/templates", label: messages.shell.templates, icon: LayoutGrid },
] as const;

const secondary = [
  { href: "/app/settings", label: messages.shell.settings, icon: Settings },
  { href: "/app/help", label: messages.shell.help, icon: CircleHelp },
] as const;

const allItems = [...primary, ...secondary];

function isCurrent(pathname: string, href: string): boolean {
  return pathname === href || (href !== "/app/overview" && pathname.startsWith(href));
}

export type NavBox = { x: number; y: number; w: number; h: number };

/** Item box relative to the nav container, including padding, border and scroll. */
export function measureRelativeBox(el: HTMLElement, container: HTMLElement): NavBox | null {
  const c = container.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  if (r.width < 2 || r.height < 2 || c.width < 2) return null;
  return {
    x: r.left - c.left + container.scrollLeft - container.clientLeft,
    y: r.top - c.top + container.scrollTop - container.clientTop,
    w: r.width,
    h: r.height,
  };
}

type Spring = { value: number; v: number };

function stepSpring(state: Spring, target: number, dt: number, stiffness: number, damping: number): void {
  const accel = -stiffness * (state.value - target) - damping * state.v;
  state.v += accel * dt;
  state.value += state.v * dt;
}

function settled(state: Spring, target: number): boolean {
  return Math.abs(state.value - target) < 0.15 && Math.abs(state.v) < 8;
}

function snap(state: Spring, value: number): void {
  state.value = value;
  state.v = 0;
}

/**
 * Shared purple pill. During motion it stretches with a spring; at rest it
 * matches the active item box exactly (scale 1, real width/height/radius).
 */
export function NavIndicator({
  rootRef,
  activeHref,
  compact,
}: {
  rootRef: RefObject<HTMLElement | null>;
  activeHref: string | undefined;
  compact: boolean;
}) {
  const reduced = useReducedMotion() ?? false;
  const pillRef = useRef<HTMLSpanElement>(null);
  const ready = useRef(false);
  const top = useRef<Spring>({ value: 0, v: 0 });
  const bottom = useRef<Spring>({ value: 0, v: 0 });
  const left = useRef<Spring>({ value: 0, v: 0 });
  const width = useRef<Spring>({ value: 0, v: 0 });
  const base = useRef({ w: 1, h: 1 });
  const target = useRef<NavBox & { down: boolean }>({ x: 0, y: 0, w: 0, h: 0, down: true });
  const raf = useRef(0);
  const [tick, setTick] = useState(0);

  const measure = (): NavBox | null => {
    const root = rootRef.current;
    if (!root || !activeHref) return null;
    const item = root.querySelector<HTMLElement>(`a[data-nav="${CSS.escape(activeHref)}"]`);
    if (!item) return null;
    return measureRelativeBox(item, root);
  };

  /** Resting paint: real box, no scale, radius of the nav link. */
  const paintRest = (box: NavBox) => {
    const el = pillRef.current;
    if (!el) return;
    snap(top.current, box.y);
    snap(bottom.current, box.y + box.h);
    snap(left.current, box.x);
    snap(width.current, box.w);
    base.current = { w: box.w, h: box.h };
    target.current = { ...box, down: target.current.down };
    el.style.width = `${box.w}px`;
    el.style.height = `${box.h}px`;
    el.style.borderRadius = "12px";
    el.style.transform = `translate3d(${box.x}px, ${box.y}px, 0)`;
    el.style.transformOrigin = "0 0";
    el.classList.add("is-ready");
    ready.current = true;
  };

  /** In-flight paint: scale from the last rest size so only the motion stretches. */
  const paintMotion = () => {
    const el = pillRef.current;
    if (!el) return;
    const y = top.current.value;
    const h = Math.max(1, bottom.current.value - top.current.value);
    const x = left.current.value;
    const w = Math.max(1, width.current.value);
    const bw = base.current.w || w;
    const bh = base.current.h || h;
    el.style.width = `${bw}px`;
    el.style.height = `${bh}px`;
    el.style.borderRadius = "12px";
    el.style.transformOrigin = "0 0";
    el.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${w / bw}, ${h / bh})`;
  };

  useLayoutEffect(() => {
    const box = measure();
    if (!box) return;
    if (reduced || !ready.current) {
      paintRest(box);
      return;
    }

    const mid = (top.current.value + bottom.current.value) / 2;
    target.current = { ...box, down: box.y + box.h / 2 >= mid };
    cancelAnimationFrame(raf.current);

    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.032, (now - last) / 1000);
      last = now;
      const goal = target.current;
      const leadingK = 540;
      const trailingK = 260;
      const damp = 30;
      if (goal.down) {
        stepSpring(bottom.current, goal.y + goal.h, dt, leadingK, damp);
        stepSpring(top.current, goal.y, dt, trailingK, damp);
      } else {
        stepSpring(top.current, goal.y, dt, leadingK, damp);
        stepSpring(bottom.current, goal.y + goal.h, dt, trailingK, damp);
      }
      stepSpring(left.current, goal.x, dt, 420, 32);
      stepSpring(width.current, goal.w, dt, 420, 32);

      const done =
        settled(top.current, goal.y) &&
        settled(bottom.current, goal.y + goal.h) &&
        settled(left.current, goal.x) &&
        settled(width.current, goal.w);

      if (done) {
        paintRest({ x: goal.x, y: goal.y, w: goal.w, h: goal.h });
        return;
      }
      paintMotion();
      raf.current = requestAnimationFrame(loop);
    };
    raf.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf.current);
    // measure/paint are stable enough for this layout effect; tick retriggers on resize/fonts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeHref, compact, reduced, tick]);

  // cacheComponents can skip useLayoutEffect on the first hydration of a
  // segment. useEffect still runs and snaps the pill to the item box.
  useEffect(() => {
    if (ready.current) return;
    const box = measure();
    if (box) {
      paintRest(box);
      return;
    }
    const id = requestAnimationFrame(() => {
      const next = measure();
      if (next && !ready.current) paintRest(next);
    });
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeHref, compact, reduced, tick]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const bump = () => setTick((value) => value + 1);
    const ro = new ResizeObserver(bump);
    ro.observe(root);
    const item = activeHref ? root.querySelector<HTMLElement>(`a[data-nav="${CSS.escape(activeHref)}"]`) : null;
    if (item) ro.observe(item);
    window.addEventListener("resize", bump);
    const fonts = document.fonts;
    fonts?.ready.then(bump).catch(() => undefined);
    if (fonts?.addEventListener) fonts.addEventListener("loadingdone", bump);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", bump);
      if (fonts?.removeEventListener) fonts.removeEventListener("loadingdone", bump);
    };
  }, [activeHref, rootRef]);

  return <span ref={pillRef} className="nav-pill" aria-hidden="true" data-nav-pill="" />;
}

export function SideNav({ onNavigate, compact = false }: { onNavigate?: () => void; compact?: boolean }) {
  const pathname = usePathname();
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const activeHref = allItems.find((item) => isCurrent(pendingHref ?? pathname, item.href))?.href;

  useLayoutEffect(() => {
    if (pendingHref && isCurrent(pathname, pendingHref)) setPendingHref(null);
  }, [pathname, pendingHref]);

  const list = (items: typeof primary | typeof secondary) => (
    <ul className="nav-list">
      {items.map((item) => {
        const Icon = item.icon;
        const current = isCurrent(pendingHref ?? pathname, item.href);
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              data-nav={item.href}
              className="nav-link"
              aria-current={current ? "page" : undefined}
              onClick={() => {
                setPendingHref(item.href);
                onNavigate?.();
              }}
              title={compact ? item.label : undefined}
            >
              <Icon size={20} strokeWidth={1.75} aria-hidden="true" />
              <span>{item.label}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );

  return (
    <div className="side-nav" ref={rootRef}>
      <NavIndicator rootRef={rootRef} activeHref={activeHref} compact={compact} />
      <nav aria-label={messages.shell.primaryNav}>{list(primary)}</nav>
      <hr className="nav-rule" />
      <nav aria-label={messages.shell.secondaryNav}>{list(secondary)}</nav>
    </div>
  );
}
