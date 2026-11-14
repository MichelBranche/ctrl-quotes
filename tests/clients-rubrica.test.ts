import { beforeEach, describe, expect, it } from "vitest";
import type { AppDatabase } from "@/db/client";
import { clients } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { addNote, clientStats, clientTimeline, createClient, listClients, setClientsArchived, updateClient } from "@/server/clients";
import { createQuote } from "@/server/quotes";
import { createTestDb } from "./helpers/db";
import { joinAs, ownerWithWorkspace } from "./helpers/actors";

function must<T>(result: { ok: true; value: T } | { ok: false; message: string }): T {
  if (!result.ok) throw new Error(result.message);
  return result.value;
}

describe("rubrica clienti", () => {
  let db: AppDatabase;
  let alpha: { userId: string; workspaceId: string };
  let beta: { userId: string; workspaceId: string };

  beforeEach(async () => {
    db = await createTestDb();
    alpha = await ownerWithWorkspace(db, "alpha@example.com", "Studio Alfa");
    beta = await ownerWithWorkspace(db, "beta@example.com", "Studio Beta");
  });

  async function setCreated(workspaceId: string, id: string, at: Date) {
    await db.update(clients).set({ createdAt: at, updatedAt: at }).where(and(eq(clients.workspaceId, workspaceId), eq(clients.id, id)));
  }

  it("filtra per stato e tipo, ordina e conta i preventivi del solo workspace", async () => {
    const a = must(await createClient(db, alpha, { kind: "azienda", name: "Bianchi Srl", status: "active" })).id;
    must(await createClient(db, alpha, { kind: "privato", name: "Anna Verdi", status: "prospect" }));
    const c = must(await createClient(db, alpha, { kind: "azienda", name: "Zeta Spa", status: "active" })).id;
    must(await setClientsArchived(db, alpha, [c], true));
    must(await createQuote(db, alpha, { clientId: a, title: "Sito" }));
    must(await createQuote(db, alpha, { clientId: a, title: "Logo" }));
    const other = must(await createClient(db, beta, { kind: "azienda", name: "Bianchi Beta" })).id;
    must(await createQuote(db, beta, { clientId: other, title: "Altro" }));

    const all = must(await listClients(db, alpha));
    expect(all.items.map((item) => item.name)).toEqual(["Anna Verdi", "Bianchi Srl"]);
    expect(all.counts).toEqual({ all: 2, active: 1, prospect: 1, archived: 1 });
    expect(all.items.find((item) => item.id === a)?.quoteCount).toBe(2);

    expect(must(await listClients(db, alpha, { sort: "-name" })).items.map((item) => item.name)).toEqual(["Bianchi Srl", "Anna Verdi"]);
    expect(must(await listClients(db, alpha, { filter: "prospect" })).items.map((item) => item.name)).toEqual(["Anna Verdi"]);
    expect(must(await listClients(db, alpha, { filter: "archived" })).items.map((item) => item.name)).toEqual(["Zeta Spa"]);
    expect(must(await listClients(db, alpha, { kind: "azienda" })).items.map((item) => item.name)).toEqual(["Bianchi Srl"]);
    expect(must(await listClients(db, beta)).items.map((item) => [item.name, item.quoteCount])).toEqual([["Bianchi Beta", 1]]);
  });

  it("calcola KPI e crescita solo da date di creazione reali", async () => {
    const now = new Date("2026-11-14T12:00:00Z");
    const ids = [];
    for (const [name, status] of [["Uno", "active"], ["Due", "prospect"], ["Tre", "active"], ["Quattro", "active"]] as const) {
      ids.push(must(await createClient(db, alpha, { kind: "azienda", name, status })).id);
    }
    await setCreated(alpha.workspaceId, ids[0]!, new Date("2025-01-10T10:00:00Z"));
    await setCreated(alpha.workspaceId, ids[1]!, new Date("2026-09-03T10:00:00Z"));
    await setCreated(alpha.workspaceId, ids[2]!, new Date("2026-10-20T10:00:00Z"));
    await setCreated(alpha.workspaceId, ids[3]!, new Date("2026-11-02T10:00:00Z"));
    must(await setClientsArchived(db, alpha, [ids[3]!], true));
    must(await createClient(db, beta, { kind: "azienda", name: "Altro workspace" }));

    const stats = must(await clientStats(db, alpha, now, 4));
    expect(stats).toMatchObject({ total: 3, active: 2, prospect: 1, archived: 1, createdThisMonth: 1, createdLastMonth: 1 });
    expect(stats.growth).toEqual([1, 2, 3, 4]);
    // Beta's only client was created today (this month): its series stays its own.
    const other = must(await clientStats(db, beta, new Date(), 4));
    expect(other.total).toBe(1);
    expect(other.growth[other.growth.length - 1]).toBe(1);
  });

  it("archivia in blocco solo i clienti del proprio workspace e rispetta i ruoli", async () => {
    const mine = must(await createClient(db, alpha, { kind: "azienda", name: "Mio" })).id;
    const theirs = must(await createClient(db, beta, { kind: "azienda", name: "Loro" })).id;
    const result = must(await setClientsArchived(db, alpha, [mine, theirs], true));
    expect(result.count).toBe(1);
    expect(must(await listClients(db, beta)).items.map((item) => item.status)).toEqual(["active"]);
    expect((await setClientsArchived(db, alpha, [], true)).ok).toBe(false);

    // A member of alpha can restore alpha clients, but never touches beta.
    const member = await joinAs(db, alpha.workspaceId, "member@example.com", "member");
    expect(must(await setClientsArchived(db, member, [mine, theirs], false)).count).toBe(1);
    const outsider = await joinAs(db, beta.workspaceId, "outsider@example.com", "member");
    expect(must(await setClientsArchived(db, outsider, [mine], true)).count).toBe(0);
    expect(must(await listClients(db, alpha)).items.map((item) => item.status)).toEqual(["active"]);
  });

  it("lo storico mostra eventi reali e non legge clienti di altri workspace", async () => {
    const id = must(await createClient(db, alpha, { kind: "azienda", name: "Storico Srl" })).id;
    must(await addNote(db, alpha, id, { body: "Prima telefonata." }));
    must(await createQuote(db, alpha, { clientId: id, title: "Sito" }));
    must(await updateClient(db, alpha, id, { kind: "azienda", name: "Storico Srl", status: "prospect" }));
    const events = must(await clientTimeline(db, alpha, id));
    expect(events.map((event) => event.kind).sort()).toEqual(["client_created", "note_added", "quote_created"]);
    expect((await clientTimeline(db, beta, id)).ok).toBe(false);
  });
});
