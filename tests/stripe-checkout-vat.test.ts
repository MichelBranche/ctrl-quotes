import { describe, expect, it } from "vitest";
import { vatTaxRateId } from "@/server/stripe/client";

describe("IVA sui checkout dei piani", () => {
  it("legge la tax rate IVA dall'ambiente e la ignora se vuota", () => {
    expect(vatTaxRateId({ STRIPE_TAX_RATE_IVA: " txr_test_123 " })).toBe("txr_test_123");
    expect(vatTaxRateId({ STRIPE_TAX_RATE_IVA: "" })).toBeUndefined();
    expect(vatTaxRateId({})).toBeUndefined();
  });
});
