import { roundHalfUp } from "@/domain/money";

export const taxProfiles = ["ordinario", "forfettario", "estero"] as const;
export type TaxProfile = (typeof taxProfiles)[number];

export const priceModes = ["net", "gross"] as const;
export type PriceMode = (typeof priceModes)[number];

export const billingCycles = ["one_time", "monthly", "yearly"] as const;
export type BillingCycle = (typeof billingCycles)[number];

export type PriceLine = {
  id: string;
  quantityMilli: number;
  unitPriceCents: number;
  discountBp: number;
  priceMode: PriceMode;
  taxRateBp: number;
  billing: BillingCycle;
};

export type PriceInput = {
  lines: PriceLine[];
  taxProfile: TaxProfile;
  /** Basis points of withholding on the one-time taxable base. Ignored for forfettario. */
  withholdingBp: number;
  stampDutyNote: boolean;
};

export type RateSlice = {
  taxRateBp: number;
  netCents: number;
  vatCents: number;
};

export type MoneyBucket = {
  netCents: number;
  vatCents: number;
  totalCents: number;
  byRate: RateSlice[];
};

export type PriceResult = {
  oneTime: MoneyBucket;
  monthly: MoneyBucket;
  yearly: MoneyBucket;
  withholdingCents: number;
  netPayableCents: number;
  notices: string[];
};

const FORFETTARIO_NOTICE =
  "Operazione effettuata in regime forfettario ai sensi dell'articolo 1, commi da 54 a 89, della Legge n. 190/2014 e successive modificazioni.";

const STAMP_NOTE =
  "In fattura sarà addebitata l'imposta di bollo di € 2,00 quando dovuta.";

const ESTERO_NOTICE =
  "IVA non applicata in base al profilo fiscale estero del workspace. La regola va confermata con il commercialista.";

const STAMP_THRESHOLD_CENTS = 7747;

function assertLine(line: PriceLine): void {
  if (!Number.isInteger(line.quantityMilli) || line.quantityMilli <= 0) {
    throw new Error(`Quantità non valida per la riga ${line.id}.`);
  }
  if (!Number.isInteger(line.unitPriceCents) || line.unitPriceCents < 0) {
    throw new Error(`Prezzo non valido per la riga ${line.id}.`);
  }
  if (!Number.isInteger(line.discountBp) || line.discountBp < 0 || line.discountBp > 10000) {
    throw new Error(`Sconto non valido per la riga ${line.id}.`);
  }
  if (!Number.isInteger(line.taxRateBp) || line.taxRateBp < 0 || line.taxRateBp > 10000) {
    throw new Error(`Aliquota non valida per la riga ${line.id}.`);
  }
}

function lineNetCents(line: PriceLine, profile: TaxProfile): number {
  const extended = roundHalfUp(line.unitPriceCents * line.quantityMilli, 1000);
  const discounted = roundHalfUp(extended * (10000 - line.discountBp), 10000);
  if (profile !== "ordinario") {
    return discounted;
  }
  switch (line.priceMode) {
    case "gross":
      return roundHalfUp(discounted * 10000, 10000 + line.taxRateBp);
    case "net":
      return discounted;
    default: {
      const exhaustive: never = line.priceMode;
      throw new Error(`Modalità prezzo sconosciuta: ${String(exhaustive)}`);
    }
  }
}

function effectiveRate(profile: TaxProfile, lineRate: number): number {
  switch (profile) {
    case "ordinario":
      return lineRate;
    case "forfettario":
    case "estero":
      return 0;
    default: {
      const exhaustive: never = profile;
      throw new Error(`Profilo fiscale sconosciuto: ${String(exhaustive)}`);
    }
  }
}

function bucketFor(groups: Map<number, number>): MoneyBucket {
  const byRate: RateSlice[] = [];
  let netCents = 0;
  let vatCents = 0;
  const rates = [...groups.keys()].sort((a, b) => a - b);
  for (const taxRateBp of rates) {
    const net = groups.get(taxRateBp) ?? 0;
    const vat = roundHalfUp(net * taxRateBp, 10000);
    byRate.push({ taxRateBp, netCents: net, vatCents: vat });
    netCents += net;
    vatCents += vat;
  }
  return { netCents, vatCents, totalCents: netCents + vatCents, byRate };
}

function emptyBucket(): MoneyBucket {
  return { netCents: 0, vatCents: 0, totalCents: 0, byRate: [] };
}

export function priceQuote(input: PriceInput): PriceResult {
  if (!Number.isInteger(input.withholdingBp) || input.withholdingBp < 0 || input.withholdingBp > 10000) {
    throw new Error("Ritenuta non valida.");
  }

  const groups: Record<BillingCycle, Map<number, number>> = {
    one_time: new Map(),
    monthly: new Map(),
    yearly: new Map(),
  };

  for (const line of input.lines) {
    assertLine(line);
    const rate = effectiveRate(input.taxProfile, line.taxRateBp);
    const net = lineNetCents(line, input.taxProfile);
    const map = groups[line.billing];
    map.set(rate, (map.get(rate) ?? 0) + net);
  }

  const oneTime = input.lines.some((line) => line.billing === "one_time")
    ? bucketFor(groups.one_time)
    : emptyBucket();
  const monthly = input.lines.some((line) => line.billing === "monthly")
    ? bucketFor(groups.monthly)
    : emptyBucket();
  const yearly = input.lines.some((line) => line.billing === "yearly")
    ? bucketFor(groups.yearly)
    : emptyBucket();

  const notices: string[] = [];
  let withholdingCents = 0;

  switch (input.taxProfile) {
    case "ordinario":
      if (input.withholdingBp > 0) {
        withholdingCents = roundHalfUp(oneTime.netCents * input.withholdingBp, 10000);
        notices.push("La ritenuta è informativa e si applica all'imponibile una tantum.");
      }
      break;
    case "forfettario":
      notices.push(FORFETTARIO_NOTICE);
      if (input.withholdingBp > 0) {
        notices.push("La ritenuta d'acconto non si applica al regime forfettario.");
      }
      if (input.stampDutyNote && oneTime.netCents > STAMP_THRESHOLD_CENTS) {
        notices.push(STAMP_NOTE);
      }
      break;
    case "estero":
      notices.push(ESTERO_NOTICE);
      break;
    default: {
      const exhaustive: never = input.taxProfile;
      throw new Error(`Profilo fiscale sconosciuto: ${String(exhaustive)}`);
    }
  }

  return {
    oneTime,
    monthly,
    yearly,
    withholdingCents,
    netPayableCents: oneTime.totalCents - withholdingCents,
    notices,
  };
}
