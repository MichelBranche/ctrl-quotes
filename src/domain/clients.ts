import { z } from "zod";

export const clientKinds = ["azienda", "privato"] as const;
export type ClientKind = (typeof clientKinds)[number];

export const clientStatuses = ["active", "prospect", "archived"] as const;
export type ClientStatus = (typeof clientStatuses)[number];

export const clientFilters = ["all", "active", "prospect", "archived"] as const;
export type ClientFilter = (typeof clientFilters)[number];

export const clientKindLabel: Record<ClientKind, string> = {
  azienda: "Azienda",
  privato: "Privato",
};

export const clientStatusLabel: Record<ClientStatus, string> = {
  active: "Cliente attivo",
  prospect: "Prospect",
  archived: "Archiviato",
};

const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, { error: `${label}: massimo ${max} caratteri.` })
    .transform((value) => (value === "" ? null : value))
    .nullable()
    .optional()
    .transform((value) => value ?? null);

const optionalEmail = z
  .string()
  .trim()
  .transform((value) => (value === "" ? null : value.toLowerCase()))
  .nullable()
  .optional()
  .transform((value) => value ?? null)
  .refine((value) => value === null || z.email().safeParse(value).success, {
    error: "Inserisci un'email valida.",
  });

const optionalWebsite = z
  .string()
  .trim()
  .transform((value) => (value === "" ? null : value))
  .nullable()
  .optional()
  .transform((value) => {
    if (!value) return null;
    return /^https?:\/\//i.test(value) ? value : `https://${value}`;
  })
  .refine((value) => value === null || /^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(value), {
    error: "Inserisci un indirizzo web valido.",
  });

const optionalPhone = optionalText(40, "Telefono").refine(
  (value) => value === null || /^[+()\d\s./-]{5,40}$/.test(value),
  { error: "Il telefono può contenere solo cifre, spazi e i simboli + ( ) - . /" },
);

const optionalVat = optionalText(20, "Partita IVA").refine(
  (value) => value === null || /^[A-Za-z]{0,2}[0-9A-Za-z]{5,18}$/.test(value.replace(/\s/g, "")),
  { error: "La partita IVA può contenere solo lettere e cifre." },
);

export const clientInputSchema = z.object({
  kind: z.enum(clientKinds, { error: "Scegli se è un'azienda o un privato." }),
  name: z
    .string()
    .trim()
    .min(2, { error: "Il nome deve avere almeno 2 caratteri." })
    .max(120, { error: "Il nome può avere al massimo 120 caratteri." }),
  status: z.enum(["active", "prospect"], { error: "Stato non valido." }).default("active"),
  sector: optionalText(80, "Settore"),
  email: optionalEmail,
  phone: optionalPhone,
  website: optionalWebsite,
  address: optionalText(200, "Indirizzo"),
  vatNumber: optionalVat,
  taxCode: optionalText(20, "Codice fiscale"),
});

export type ClientInput = z.infer<typeof clientInputSchema>;

export const contactInputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, { error: "Il nome deve avere almeno 2 caratteri." })
    .max(120, { error: "Il nome può avere al massimo 120 caratteri." }),
  email: optionalEmail,
  phone: optionalPhone,
  roleLabel: optionalText(80, "Ruolo"),
  isPrimary: z.boolean().default(false),
});

export type ContactInput = z.infer<typeof contactInputSchema>;

export const noteInputSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, { error: "La nota è vuota." })
    .max(2000, { error: "La nota può avere al massimo 2000 caratteri." }),
});

export function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Dati non validi.";
}

export function fieldIssues(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    out[key] ??= issue.message;
  }
  return out;
}

/** Escapes LIKE wildcards so a search for "50%" matches literally. */
export function likePattern(query: string): string {
  return `%${query.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}
