"use client";

import { useRef, useState } from "react";
import { snapSplit, spanLabel, splitSpans, type Span } from "@/domain/columns";
import { cn } from "@/lib/cn";
import type { BlockBox } from "./geometry";

/**
 * The divider between the two columns of a row, on the sheet: drag it sideways and the widths
 * snap to sixths (1/3, 1/2, 2/3) while the page follows live. Arrow keys do the same. Rows of
 * three columns have a single layout, so they get no divider.
 */
export type DividerRow = { row: string; left: BlockBox; right: BlockBox; first: Span; label: string };

export function RowDivider({ row, onChange, onDone }: { row: DividerRow; onChange: (spans: Span[], group: string) => void; onDone: (spans: Span[]) => void }) {
  const drag = useRef<{ left: number; width: number; pointer: number; group: string; first: Span } | null>(null);
  const [active, setActive] = useState<{ left: number; width: number; first: Span } | null>(null);
  const top = Math.min(row.left.y, row.right.y);
  const bottom = Math.max(row.left.y + row.left.h, row.right.y + row.right.h);
  const x = (row.left.x + row.left.w + row.right.x) / 2;
  const first = active?.first ?? row.first;

  const set = (next: Span, group: string) => {
    if (next === (drag.current?.first ?? row.first)) return;
    if (drag.current) drag.current.first = next;
    setActive((current) => (current ? { ...current, first: next } : current));
    onChange(splitSpans(next), group);
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.focus({ preventScroll: true });
    const left = row.left.x;
    const width = row.right.x + row.right.w - left;
    drag.current = { left, width, pointer: event.pointerId, group: `divider:${row.row}:${Date.now()}`, first: row.first };
    setActive({ left, width, first: row.first });
  };
  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (!current || current.pointer !== event.pointerId) return;
    const origin = event.currentTarget.offsetParent?.getBoundingClientRect();
    const pointer = event.clientX - (origin?.left ?? 0);
    set(snapSplit((pointer - current.left) / current.width), current.group);
  };
  const finish = (event: React.PointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (!current || current.pointer !== event.pointerId) return;
    drag.current = null;
    setActive(null);
    if (current.first !== row.first) onDone(splitSpans(current.first));
  };
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const step = event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0;
    const edge = event.key === "Home" ? 2 : event.key === "End" ? 4 : 0;
    if (!step && !edge) return;
    event.preventDefault();
    event.stopPropagation();
    const next = (edge || Math.min(4, Math.max(2, row.first + step))) as Span;
    if (next === row.first) return;
    onChange(splitSpans(next), `divider:${row.row}:keys`);
    onDone(splitSpans(next));
  };

  return (
    <>
      {active ? (
        <div className="ve-divider-guides" aria-hidden="true" style={{ left: active.left, top, width: active.width, height: bottom - top }}>
          {([2, 3, 4] as const).map((span) => (
            <i key={span} className={cn(span === first && "is-on")} style={{ left: `${(span / 6) * 100}%` }} />
          ))}
          <span className="ve-divider-badge" style={{ left: `${(first / 6) * 100}%` }}>
            {`${spanLabel(first)} + ${spanLabel(6 - first)}`}
          </span>
        </div>
      ) : null}
      <div
        className={cn("ve-divider", active && "is-active")}
        data-ve-ui=""
        role="separator"
        aria-orientation="vertical"
        aria-label={`Larghezza delle colonne: ${row.label}`}
        aria-valuemin={2}
        aria-valuemax={4}
        aria-valuenow={first}
        aria-valuetext={`${spanLabel(first)} e ${spanLabel(6 - first)}`}
        tabIndex={0}
        title="Trascina per cambiare la larghezza delle colonne"
        style={{ left: x - 9, top, height: bottom - top }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finish}
        onPointerCancel={finish}
        onKeyDown={onKeyDown}
        onClick={(event) => event.stopPropagation()}
      >
        <span className="ve-divider-grip" aria-hidden="true" />
      </div>
    </>
  );
}
