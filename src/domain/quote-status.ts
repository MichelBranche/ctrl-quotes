type BadgeTone = "success" | "warning" | "danger" | "draft" | "info";

export const quoteStatuses = ["draft", "pending", "changes_requested", "accepted", "rejected", "expired", "revoked"] as const;
export type QuoteStatus = (typeof quoteStatuses)[number];

export function asQuoteStatus(value: string): QuoteStatus {
  return (quoteStatuses as readonly string[]).includes(value) ? (value as QuoteStatus) : "draft";
}

export const quoteStatusLabel: Record<QuoteStatus, string> = {
  draft: "Bozza",
  pending: "In attesa",
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

/** Only these states accept draft edits. Publication arrives in phase 4. */
export function isEditable(status: QuoteStatus): boolean {
  return status === "draft" || status === "changes_requested";
}

export const quoteFilters = ["all", "draft", "pending", "accepted", "rejected", "expired"] as const;
export type QuoteFilter = (typeof quoteFilters)[number];
