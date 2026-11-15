"use client";

import StatusMark, { type StatusMarkStatus } from "./reactbits/StatusMark";

export type { StatusMarkStatus };

/**
 * App-wide async state: React Bits StatusMark in brand colours. Saved and sent states keep their
 * label readable (`strike` off); a finished to-do like "Upload" may strike through.
 */
export function Status({ status, label, strike = false, size = 15, fontSize = 13, className }: { status: StatusMarkStatus; label: React.ReactNode; strike?: boolean; size?: number; fontSize?: number; className?: string }) {
  return <StatusMark status={status} label={label} strike={strike} size={size} fontSize={fontSize} strokeWidth={2} color="var(--cq-accent)" doneColor="#16A34A" errorColor="#DC2626" className={`cq-status${className ? ` ${className}` : ""}`} />;
}

/** The spinner inside a busy button: StatusMark running, in the button's own text colour. */
export function BusyMark({ size = 16 }: { size?: number }) {
  return (
    <span className="busy-mark" aria-hidden="true">
      <StatusMark status="running" size={size} strokeWidth={2} color="currentColor" />
    </span>
  );
}
