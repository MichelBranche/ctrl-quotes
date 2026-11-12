import { z } from "zod";
import { checkNumberFormat } from "@/domain/numbering";
import { taxProfiles } from "@/domain/pricing";

export const fiscalSettingsSchema = z.object({
  taxProfile: z.enum(taxProfiles, { error: "Regime fiscale non valido." }),
  defaultTaxRateBp: z.number().int().refine((value) => [2200, 1000, 500, 400, 0].includes(value), {
    error: "Aliquota IVA non valida.",
  }),
  defaultPriceMode: z.enum(["net", "gross"], { error: "Modalità prezzo non valida." }),
  stampDutyNote: z.boolean(),
});

export const numberingSettingsSchema = z.object({
  format: z
    .string()
    .trim()
    .superRefine((value, ctx) => {
      const check = checkNumberFormat(value);
      if (!check.ok) ctx.addIssue({ code: "custom", message: check.message });
    }),
  numberReset: z.enum(["yearly", "never"], { error: "Scegli quando azzerare il contatore." }),
});

export const termsSettingsSchema = z.object({
  defaultTerms: z
    .string()
    .trim()
    .max(4000, { error: "Le condizioni possono avere al massimo 4000 caratteri." })
    .transform((value) => (value === "" ? null : value))
    .nullable(),
  defaultValidityDays: z
    .number({ error: "Indica la validità in giorni." })
    .int({ error: "Indica la validità in giorni interi." })
    .min(1, { error: "La validità minima è 1 giorno." })
    .max(365, { error: "La validità massima è 365 giorni." }),
});

export const taxProfileLabel = {
  ordinario: "Ordinario",
  forfettario: "Forfettario",
  estero: "Estero",
} as const;
