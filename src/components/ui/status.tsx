import type { ReactNode } from "react";
import { messages } from "@/i18n/it";

const tones = {
  success: "badge-success",
  warning: "badge-warning",
  danger: "badge-danger",
  draft: "badge-draft",
  info: "badge-info",
} as const;

export type BadgeTone = keyof typeof tones;

export function StatusBadge({ tone, children }: { tone: BadgeTone; children: ReactNode }) {
  return (
    <span className={`badge ${tones[tone]}`}>
      <i aria-hidden="true" />
      {children}
    </span>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <section className="card empty">
      <h2>{title}</h2>
      <p>{body}</p>
      {action ? <div style={{ marginTop: 16 }}>{action}</div> : null}
    </section>
  );
}

export function Skeleton({ width = "100%" }: { width?: string }) {
  return <span className="skeleton" style={{ width }} aria-hidden="true" />;
}

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div>
        <h1>{title}</h1>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
      {action}
    </header>
  );
}

export function FutureNote() {
  return <p className="field-hint">{messages.future.action}</p>;
}
