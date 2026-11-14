type BadgeTone = "success" | "warning" | "danger" | "draft" | "info";

export const quoteStatuses = ["draft", "pending", "changes_requested", "accepted", "rejected", "expired", "revoked"] as const;
export type QuoteStatus = (typeof quoteStatuses)[number];

export function asQuoteStatus(value: string): QuoteStatus {
  return (quoteStatuses as readonly string[]).includes(value) ? (value as QuoteStatus) : "draft";
}

export const quoteStatusLabel: Record<QuoteStatus, string> = {
  draft: "Bozza",
  pending: "Inviato",
  changes_requested: "Modifiche richieste",
  accepted: "Accettato",
  rejected: "Rifiutato",
  expired: "Scaduto",
  revoked: "Revocato",
};

export const quoteStatusTone: Record<QuoteStatus, BadgeTone> = {
  draft: "draft",
  pending: "info",
  changes_requested: "warning",
  accepted: "success",
  rejected: "danger",
  expired: "warning",
  revoked: "draft",
};

/**
 * Phase 4 (decided 14 Nov 2026): the draft stays editable after sending. The client keeps seeing
 * the last sent version until "Invia aggiornamento". Only an accepted quote is frozen.
 */
export function isEditable(status: QuoteStatus): boolean {
  return status !== "accepted";
}

/** What can happen to a quote. Views are not here: "Visto" is a detail of "Inviato", not a state. */
export type QuoteTransition = "send" | "accept" | "reject" | "request_changes" | "expire" | "revoke";

export type TransitionActor = "user" | "recipient" | "system";

const transitionTable: Record<QuoteTransition, { to: QuoteStatus; from: readonly QuoteStatus[]; actors: readonly TransitionActor[] }> = {
  send: { to: "pending", from: ["draft", "pending", "changes_requested", "rejected", "expired", "revoked"], actors: ["user"] },
  accept: { to: "accepted", from: ["pending", "changes_requested"], actors: ["recipient"] },
  reject: { to: "rejected", from: ["pending", "changes_requested"], actors: ["recipient"] },
  request_changes: { to: "changes_requested", from: ["pending", "changes_requested"], actors: ["recipient"] },
  expire: { to: "expired", from: ["pending", "changes_requested"], actors: ["system"] },
  revoke: { to: "revoked", from: ["pending", "changes_requested", "rejected", "expired"], actors: ["user"] },
};

/** Next status, or null when the transition is not allowed. The single rule book for every caller. */
export function nextQuoteStatus(from: QuoteStatus, transition: QuoteTransition, actor: TransitionActor): QuoteStatus | null {
  const rule = transitionTable[transition];
  if (!rule.actors.includes(actor)) return null;
  return rule.from.includes(from) ? rule.to : null;
}

/** The client can still accept, reject or ask for changes. */
export function isOpenForClient(status: QuoteStatus): boolean {
  return status === "pending" || status === "changes_requested";
}

/** Sending the first time says "Invia", later "Invia aggiornamento". */
export function sendLabel(sentVersionId: string | null): string {
  return sentVersionId ? "Invia aggiornamento" : "Invia";
}

export const quoteFilters = ["all", "draft", "pending", "accepted", "rejected", "expired"] as const;
export type QuoteFilter = (typeof quoteFilters)[number];
