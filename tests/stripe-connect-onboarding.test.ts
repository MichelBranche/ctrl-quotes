import { describe, expect, it } from "vitest";
import {
  CONNECT_ACCOUNTS_API_VERSION,
  CONNECT_ONBOARDING_REFRESH_PATH,
  CONNECT_ONBOARDING_RETURN_PATH,
  connectAccountCreateParams,
  connectAccountLinkCreateParams,
  statusFromAccount,
} from "@/server/stripe/connect";

describe("onboarding Stripe Connect (Accounts v2)", () => {
  it("usa la versione preview, Express, IT/EUR e Managed Risk", () => {
    expect(CONNECT_ACCOUNTS_API_VERSION).toBe("2026-10-28.preview");
    const params = connectAccountCreateParams({
      workspaceId: "ws_studio",
      name: "Studio Test",
      email: "studio@example.com",
    });
    expect(params.dashboard).toBe("express");
    expect(params.identity).toEqual({ country: "IT" });
    expect(params.defaults?.currency).toBe("eur");
    expect(params.defaults?.responsibilities).toEqual({
      fees_collector: "stripe",
      losses_collector: "stripe",
    });
    expect(params.configuration?.merchant?.capabilities?.card_payments).toEqual({ requested: true });
    expect(params.display_name).toBe("Studio Test");
    expect(params.contact_email).toBe("studio@example.com");
    expect(params.metadata).toEqual({ app: "ctrl-quotes", workspace_id: "ws_studio" });
    expect(params).not.toHaveProperty("type");
  });

  it("prepara l'Account Link v2 con ritorno e ripartenza", () => {
    const params = connectAccountLinkCreateParams("acct_test", "https://quotes.ctrlagency.dev");
    expect(params.account).toBe("acct_test");
    expect(params.use_case.type).toBe("account_onboarding");
    expect(params.use_case.account_onboarding).toEqual({
      refresh_url: `https://quotes.ctrlagency.dev${CONNECT_ONBOARDING_REFRESH_PATH}`,
      return_url: `https://quotes.ctrlagency.dev${CONNECT_ONBOARDING_RETURN_PATH}`,
    });
    expect(CONNECT_ONBOARDING_REFRESH_PATH).toBe("/app/settings/payments?stripe=riparti");
    expect(CONNECT_ONBOARDING_RETURN_PATH).toBe("/app/settings/payments?stripe=ritorno");
  });

  it("legge lo stato sia da charges_enabled v1 sia dalla capability v2", () => {
    expect(statusFromAccount({ charges_enabled: true })).toBe("active");
    expect(statusFromAccount({ charges_enabled: false, details_submitted: true })).toBe("pending");
    expect(
      statusFromAccount({
        configuration: { merchant: { capabilities: { card_payments: { status: "active" } } } },
      }),
    ).toBe("active");
    expect(
      statusFromAccount({
        configuration: {
          merchant: {
            capabilities: {
              card_payments: { status: "restricted", status_details: [{ code: "requirements_past_due" }] },
            },
          },
        },
      }),
    ).toBe("pending");
    expect(
      statusFromAccount({
        configuration: { merchant: { capabilities: { card_payments: { status: "pending" } } } },
      }),
    ).toBe("pending");
  });
});
