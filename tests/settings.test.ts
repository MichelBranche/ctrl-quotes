import { beforeEach, describe, expect, it } from "vitest";
import type { AppDatabase } from "@/db/client";
import { contrastRatio, readableOn, sniffLogo } from "@/domain/brand";
import { checkNumberFormat, formatQuoteNumber } from "@/domain/numbering";
import { can } from "@/domain/permissions";
import {
  getWorkspaceConfig,
  readAsset,
  removeLogo,
  saveBrand,
  saveFiscal,
  saveNumbering,
  saveTerms,
  setLogo,
} from "@/server/settings";
import { changeMemberRole, listMembers, removeMember } from "@/server/team";
import { listTemplates, setDefaultTemplate, toggleFavorite } from "@/server/templates";
import { createTestDb } from "./helpers/db";
import { joinAs, ownerWithWorkspace } from "./helpers/actors";

function must<T>(result: { ok: true; value: T } | { ok: false; message: string }): T {
  if (!result.ok) throw new Error(result.message);
  return result.value;
}

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const brand = {
  companyName: "Studio Prova",
  colorPrimary: "#0b0b0f",
  colorSecondary: "#7C3AED",
  colorBackground: "#F4F2FF",
  fontHeading: "Instrument Serif",
  fontBody: "Inter",
  applyAutomatically: true,
};

describe("numerazione e brand", () => {
  it("valida il formato e genera l'anteprima", () => {
    expect(checkNumberFormat("QT-{YYYY}-{0000}").ok).toBe(true);
    expect(checkNumberFormat("QT-{YYYY}").ok).toBe(false);
    expect(checkNumberFormat("{000}{0000}").ok).toBe(false);
    expect(checkNumberFormat("QT {YYYY}-{0000}").ok).toBe(false);
    expect(checkNumberFormat("QT-{MM}-{0000}").ok).toBe(false);
    expect(formatQuoteNumber("QT-{YYYY}-{0000}", 2026, 7)).toBe("QT-2026-0007");
    expect(formatQuoteNumber("PREV/{YY}/{000}", 2026, 12)).toBe("PREV/26/012");
  });

  it("riconosce i formati dei loghi dai byte e blocca gli SVG attivi", () => {
    expect(sniffLogo(png)).toEqual({ ok: true, mime: "image/png" });
    expect(sniffLogo(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toEqual({ ok: true, mime: "image/jpeg" });
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><rect width="4" height="4"/></svg>');
    expect(sniffLogo(svg)).toEqual({ ok: true, mime: "image/svg+xml" });
    const evil = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>');
    expect(sniffLogo(evil).ok).toBe(false);
    expect(sniffLogo(new TextEncoder().encode("GIF89a")).ok).toBe(false);
    expect(sniffLogo(new Uint8Array(1024 * 1024 + 1)).ok).toBe(false);
  });

  it("sceglie un colore di testo leggibile", () => {
    expect(readableOn("#0B0B0F")).toBe("#FFFFFF");
    expect(readableOn("#F4F2FF")).toBe("#0B0B0F");
    expect(contrastRatio("#FFFFFF", "#000000")).toBeCloseTo(21, 0);
  });

  it("matrice permessi", () => {
    expect(can("member", "clients.write")).toBe(true);
    expect(can("member", "clients.delete")).toBe(false);
    expect(can("admin", "brand.write")).toBe(true);
    expect(can("admin", "team.role")).toBe(false);
    expect(can("owner", "team.role")).toBe(true);
  });
});

describe("impostazioni, brand kit, template e team", () => {
  let db: AppDatabase;
  let alpha: { userId: string; workspaceId: string };
  let beta: { userId: string; workspaceId: string };

  beforeEach(async () => {
    db = await createTestDb();
    alpha = await ownerWithWorkspace(db, "alpha@example.com", "Studio Alfa");
    beta = await ownerWithWorkspace(db, "beta@example.com", "Studio Beta");
  });

  it("salva brand kit, fiscale, numerazione e condizioni", async () => {
    const empty = must(await getWorkspaceConfig(db, alpha));
    expect(empty.brand.companyName).toBeNull();
    expect(empty.brand.vatNumber).toBeNull();
    must(await saveBrand(db, alpha, { ...brand, vatNumber: "IT01234567890", email: "Info@Prova.example" }));
    must(await saveFiscal(db, alpha, { taxProfile: "forfettario", defaultTaxRateBp: 0, defaultPriceMode: "net", stampDutyNote: true }));
    must(await saveNumbering(db, alpha, { format: "PREV-{YY}-{000}", numberReset: "never" }));
    must(await saveTerms(db, alpha, { defaultTerms: "Valida 30 giorni.", defaultValidityDays: 45 }));
    const config = must(await getWorkspaceConfig(db, alpha));
    expect(config.brand.colorPrimary).toBe("#0B0B0F");
    expect(config.brand.email).toBe("info@prova.example");
    expect(config.brand.quoteNumberFormat).toBe("PREV-{YY}-{000}");
    expect(config.brand.defaultTerms).toBe("Valida 30 giorni.");
    expect(config.workspace.taxProfile).toBe("forfettario");
    expect(config.settings).toMatchObject({ defaultTaxRateBp: 0, numberReset: "never", defaultValidityDays: 45 });
    expect((await saveNumbering(db, alpha, { format: "senza-contatore", numberReset: "yearly" })).ok).toBe(false);
    expect((await saveBrand(db, alpha, { ...brand, colorPrimary: "viola" })).ok).toBe(false);
  });

  it("carica, sostituisce e rimuove il logo nel database del workspace", async () => {
    const first = must(await setLogo(db, alpha, { bytes: png, filename: "logo.png" }));
    const second = must(await setLogo(db, alpha, { bytes: png, filename: "logo<script>.png" }));
    expect((await readAsset(db, alpha, first.assetId)).ok).toBe(false);
    const asset = must(await readAsset(db, alpha, second.assetId));
    expect(asset.mime).toBe("image/png");
    expect(must(await getWorkspaceConfig(db, alpha)).brand.logo?.filename).toBe("logo_script_.png");
    expect((await readAsset(db, beta, second.assetId)).ok).toBe(false);
    expect((await readAsset(db, { ...beta, workspaceId: alpha.workspaceId }, second.assetId)).ok).toBe(false);
    must(await removeLogo(db, alpha));
    expect(must(await getWorkspaceConfig(db, alpha)).brand.logo).toBeNull();
  });

  it("isola impostazioni e brand kit tra workspace", async () => {
    must(await saveBrand(db, beta, { ...brand, companyName: "Beta Srl" }));
    expect(must(await getWorkspaceConfig(db, alpha)).brand.companyName).toBeNull();
    const intruder = { ...alpha, workspaceId: beta.workspaceId };
    expect((await saveBrand(db, intruder, brand)).ok).toBe(false);
    expect((await saveFiscal(db, intruder, { taxProfile: "estero", defaultTaxRateBp: 0, defaultPriceMode: "net", stampDutyNote: false })).ok).toBe(false);
    expect((await saveTerms(db, intruder, { defaultTerms: "x", defaultValidityDays: 10 })).ok).toBe(false);
    expect((await setLogo(db, intruder, { bytes: png, filename: "x.png" })).ok).toBe(false);
    expect((await getWorkspaceConfig(db, intruder)).ok).toBe(false);
    expect(must(await getWorkspaceConfig(db, beta)).brand.companyName).toBe("Beta Srl");
  });

  it("il membro legge ma non modifica brand e impostazioni", async () => {
    const member = await joinAs(db, alpha.workspaceId, "membro@example.com", "member");
    expect((await getWorkspaceConfig(db, member)).ok).toBe(true);
    const denied = await saveBrand(db, member, brand);
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.error).toBe("forbidden");
    expect((await saveNumbering(db, member, { format: "QT-{0000}", numberReset: "yearly" })).ok).toBe(false);
    expect((await setLogo(db, member, { bytes: png, filename: "x.png" })).ok).toBe(false);
  });

  it("elenca i cinque template, salva preferiti e predefinito per workspace", async () => {
    const list = must(await listTemplates(db, alpha));
    expect(list.map((template) => template.key)).toEqual(["minimal", "studio", "editorial", "corporate", "bold"]);
    expect(list.map((template) => template.name)).toEqual(["Swiss Minimal", "Studio Editorial", "Editorial Atelier", "Corporate Executive", "Bold Impact"]);
    expect(list.find((template) => template.isDefault)?.key).toBe("minimal");
    expect(must(await toggleFavorite(db, alpha, "tpl_bold")).favorite).toBe(true);
    must(await setDefaultTemplate(db, alpha, "tpl_editorial"));
    const after = must(await listTemplates(db, alpha));
    expect(after.find((template) => template.isDefault)?.key).toBe("editorial");
    expect(after.find((template) => template.key === "bold")?.isFavorite).toBe(true);
    const other = must(await listTemplates(db, beta));
    expect(other.find((template) => template.isDefault)?.key).toBe("minimal");
    expect(other.some((template) => template.isFavorite)).toBe(false);
    expect(must(await toggleFavorite(db, alpha, "tpl_bold")).favorite).toBe(false);
    expect((await setDefaultTemplate(db, alpha, "tpl_inesistente")).ok).toBe(false);
    const member = await joinAs(db, alpha.workspaceId, "membro@example.com", "member");
    expect((await toggleFavorite(db, member, "tpl_minimal")).ok).toBe(true);
    expect((await setDefaultTemplate(db, member, "tpl_bold")).ok).toBe(false);
    expect((await setDefaultTemplate(db, { ...alpha, workspaceId: beta.workspaceId }, "tpl_bold")).ok).toBe(false);
  });

  it("gestisce ruoli del team lato server", async () => {
    const admin = await joinAs(db, alpha.workspaceId, "admin@example.com", "admin");
    const member = await joinAs(db, alpha.workspaceId, "membro@example.com", "member");
    const other = await joinAs(db, alpha.workspaceId, "altro@example.com", "member");
    const team = must(await listMembers(db, alpha));
    expect(team.members).toHaveLength(4);
    expect(team.members.find((entry) => entry.isSelf)?.canRemove).toBe(false);
    expect((await changeMemberRole(db, admin, member.userId, "admin")).ok).toBe(false);
    expect((await changeMemberRole(db, alpha, alpha.userId, "member")).ok).toBe(false);
    expect((await changeMemberRole(db, alpha, member.userId, "owner")).ok).toBe(false);
    must(await changeMemberRole(db, alpha, member.userId, "admin"));
    expect((await removeMember(db, admin, member.userId)).ok).toBe(false);
    expect((await removeMember(db, admin, alpha.userId)).ok).toBe(false);
    expect((await removeMember(db, admin, other.userId)).ok).toBe(true);
    expect((await removeMember(db, member, alpha.userId)).ok).toBe(false);
    expect((await listMembers(db, beta)).ok && must(await listMembers(db, beta)).members).toHaveLength(1);
    expect((await removeMember(db, beta, member.userId)).ok).toBe(false);
    expect((await listMembers(db, { ...beta, workspaceId: alpha.workspaceId })).ok).toBe(false);
  });
});
