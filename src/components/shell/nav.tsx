"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
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

type Spring = { value: number; v: number };

function stepSpring(state: Spring, target: number, dt: number, stiffness: number, damping: number): void {
  const accel = -stiffness * (state.value - target) - damping * state.v;
  state.v += accel * dt;
  state.value += state.v * dt;
}

function settled(state: Spring, target: number): boolean {
  return Math.abs(state.value - target) < 0.15 && Math.abs(state.v) < 8;
}

/**
 * A single purple pill that glides between sidebar items. The leading edge
 * stretches toward the target, then the trailing edge catches up; a slight
 * squash lands it. GPU transforms only.
 */
function NavPill({
  rootRef,
  activeHref,
  compact,
}: {
  rootRef: RefObject<HTMLDivElement | null>;
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
  const squash = useRef<Spring>({ value: 1, v: 0 });
  const target = useRef({ x: 0, y: 0, w: 0, h: 0, down: true });
  const landing = useRef(false);
  const raf = useRef(0);
  const [follow, setFollow] = useState(0);

  const paint = () => {
    const el = pillRef.current;
    if (!el) return;
    const y = top.current.value;
    const h = Math.max(1, bottom.current.value - top.current.value);
    const x = left.current.value;
    const w = Math.max(1, width.current.value);
    const s = squash.current.value;
    el.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${w}, ${h * s})`;
    el.style.borderRadius = `${12 / w}px / ${12 / (h * s)}px`;
    el.style.opacity = target.current.w > 0 ? "1" : "0";
  };

  useEffect(() => {
    const root = rootRef.current;
    const measure = () => {
      if (!root || !activeHref) return null;
      const item = root.querySelector<HTMLElement>(`a[data-nav="${CSS.escape(activeHref)}"]`);
      if (!item) return null;
      const a = root.getBoundingClientRect();
      const b = item.getBoundingClientRect();
      if (a.width < 2 || b.width < 2) return null;
      return { x: b.left - a.left, y: b.top - a.top, w: b.width, h: b.height };
    };

    const jump = (box: { x: number; y: number; w: number; h: number }) => {
      top.current = { value: box.y, v: 0 };
      bottom.current = { value: box.y + box.h, v: 0 };
      left.current = { value: box.x, v: 0 };
      width.current = { value: box.w, v: 0 };
      squash.current = { value: 1, v: 0 };
      target.current = { ...box, down: true };
      ready.current = true;
      landing.current = false;
      paint();
    };

    const box = measure();
    if (!box) return;
    if (reduced || !ready.current) {
      jump(box);
      return;
    }

    const mid = (top.current.value + bottom.current.value) / 2;
    target.current = { ...box, down: box.y + box.h / 2 >= mid };
    landing.current = false;
    cancelAnimationFrame(raf.current);

    let last = performance.now();
    const tick = (now: number) => {
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

      if (done && !landing.current) {
        landing.current = true;
        squash.current = { value: 0.94, v: 0 };
      }
      if (landing.current) stepSpring(squash.current, 1, dt, 680, 22);

      paint();
      const squashDone = !landing.current || settled(squash.current, 1);
      if (!(done && squashDone)) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [activeHref, compact, reduced, rootRef, follow]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const ro = new ResizeObserver(() => {
      const item = activeHref ? root.querySelector<HTMLElement>(`a[data-nav="${CSS.escape(activeHref)}"]`) : null;
      if (!item) return;
      const a = root.getBoundingClientRect();
      const b = item.getBoundingClientRect();
      if (a.width < 2 || b.width < 2) return;
      const next = { x: b.left - a.left, y: b.top - a.top, w: b.width, h: b.height };
      const prev = target.current;
      const moved = Math.abs(next.x - prev.x) > 0.5 || Math.abs(next.y - prev.y) > 0.5 || Math.abs(next.w - prev.w) > 0.5 || Math.abs(next.h - prev.h) > 0.5;
      if (!moved) return;
      target.current = { ...next, down: prev.down };
      if (reduced) {
        top.current = { value: next.y, v: 0 };
        bottom.current = { value: next.y + next.h, v: 0 };
        left.current = { value: next.x, v: 0 };
        width.current = { value: next.w, v: 0 };
        paint();
      } else {
        setFollow((value) => value + 1);
      }
    });
    ro.observe(root);
    return () => ro.disconnect();
  }, [activeHref, reduced, rootRef]);

  return <span ref={pillRef} className="nav-pill" aria-hidden="true" />;
}

export function SideNav({ onNavigate, compact = false }: { onNavigate?: () => void; compact?: boolean }) {
  const pathname = usePathname();
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const activeHref = allItems.find((item) => isCurrent(pendingHref ?? pathname, item.href))?.href;

  useEffect(() => {
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
      <NavPill rootRef={rootRef} activeHref={activeHref} compact={compact} />
      <nav aria-label={messages.shell.primaryNav}>{list(primary)}</nav>
      <hr className="nav-rule" />
      <nav aria-label={messages.shell.secondaryNav}>{list(secondary)}</nav>
    </div>
  );
}
