import { describe, expect, it } from "vitest";
import { INVITE_DAYS, inviteEmailSubject, renderInviteEmail } from "@/server/email/invite";

const url = "https://quotes.ctrlagency.dev/invite/abcdefghijklmnopqrstuvwxABCDEFGHIJKLMNO12";

describe("email di invito al team", () => {
  const rendered = renderInviteEmail({
    url,
    workspaceName: "Studio Demo",
    inviterName: "Anna Rossi",
    role: "member",
    year: 2026,
    assetBase: "https://quotes.ctrlagency.dev/email",
  });

  it("usa il layout di sistema, il pulsante e la scadenza di 7 giorni", () => {
    expect(rendered.subject).toBe(inviteEmailSubject("Studio Demo"));
    expect(INVITE_DAYS).toBe(7);
    expect(rendered.html).toContain("<table");
    expect(rendered.html).toContain("max-width:600px");
    expect(rendered.html).toContain("https://quotes.ctrlagency.dev/email/logo.png");
    expect(rendered.html).toContain("https://quotes.ctrlagency.dev/email/hero.png");
    expect(rendered.html).toContain("Accetta l'invito");
    expect(rendered.html).toContain(url);
    expect(rendered.html).toContain("Anna Rossi");
    expect(rendered.html).toContain("Studio Demo");
    expect(rendered.html).toContain("Membro");
    expect(rendered.html).toContain(`>${INVITE_DAYS} giorni<`);
    expect(rendered.html).toContain("Non aspettavi questo invito?");
    expect(rendered.html).toContain("© 2026 CTRL® Quotes");
  });

  it("ha un fallback in testo semplice con il link copiabile", () => {
    expect(rendered.text).toContain("Anna Rossi ti invita a unirti a Studio Demo come Membro.");
    expect(rendered.text).toContain(url);
    expect(rendered.text).toContain("Il link è valido per 7 giorni e si può usare una sola volta.");
    expect(rendered.text).toContain("Ignora questa email: nessun account viene creato e non entri nel workspace.");
  });
});
