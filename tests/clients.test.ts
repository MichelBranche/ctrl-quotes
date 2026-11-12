import { beforeEach, describe, expect, it } from "vitest";
import type { AppDatabase } from "@/db/client";
import {
  addNote,
  createClient,
  deleteClient,
  deleteContact,
  deleteNote,
  getClient,
  listClients,
  saveContact,
  setClientArchived,
  updateClient,
} from "@/server/clients";
import { createTestDb } from "./helpers/db";
import { joinAs, ownerWithWorkspace } from "./helpers/actors";

function must<T>(result: { ok: true; value: T } | { ok: false; message: string }): T {
  if (!result.ok) throw new Error(result.message);
  return result.value;
}

describe("clienti", () => {
  let db: AppDatabase;
  let alpha: { userId: string; workspaceId: string };
  let beta: { userId: string; workspaceId: string };

  beforeEach(async () => {
    db = await createTestDb();
    alpha = await ownerWithWorkspace(db, "alpha@example.com", "Studio Alfa");
    beta = await ownerWithWorkspace(db, "beta@example.com", "Studio Beta");
  });

  it("crea, legge, aggiorna, archivia ed elimina un cliente", async () => {
    const { id } = must(
      await createClient(db, alpha, { kind: "azienda", name: "Studio Forma", email: "INFO@forma.example", website: "forma.example" }),
    );
    const detail = must(await getClient(db, alpha, id));
    expect(detail.email).toBe("info@forma.example");
    expect(detail.website).toBe("https://forma.example");
    expect(detail.status).toBe("active");

    must(await updateClient(db, alpha, id, { kind: "azienda", name: "Studio Forma Srl", status: "prospect" }));
    expect(must(await getClient(db, alpha, id)).name).toBe("Studio Forma Srl");

    must(await setClientArchived(db, alpha, id, true));
    expect(must(await listClients(db, alpha, { filter: "all" })).items).toHaveLength(0);
    expect(must(await listClients(db, alpha, { filter: "archived" })).items).toHaveLength(1);
    must(await setClientArchived(db, alpha, id, false));
    expect(must(await getClient(db, alpha, id)).status).toBe("active");

    must(await deleteClient(db, alpha, id));
    const gone = await getClient(db, alpha, id);
    expect(gone.ok).toBe(false);
  });

  it("valida i campi e rifiuta un'email non valida", async () => {
    const result = await createClient(db, alpha, { kind: "azienda", name: "X", email: "non-valida" });
    expect(result.ok).toBe(false);
    const bad = await createClient(db, alpha, { kind: "azienda", name: "Cliente", email: "non-valida" });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.message).toMatch(/email/i);
  });

  it("filtra per stato e tipo, cerca per nome, email e partita IVA, pagina sul server", async () => {
    for (let index = 0; index < 25; index += 1) {
      must(await createClient(db, alpha, { kind: index % 5 === 0 ? "privato" : "azienda", name: `Cliente ${String(index).padStart(2, "0")}`, status: index % 2 ? "prospect" : "active" }));
    }
    must(await createClient(db, alpha, { kind: "azienda", name: "Atelier Milano", email: "ciao@atelier.example", vatNumber: "IT12345678901" }));
    const list = must(await listClients(db, alpha, { pageSize: 10 }));
    expect(list.total).toBe(26);
    expect(list.items).toHaveLength(10);
    expect(list.items[0]?.name).toBe("Atelier Milano");
    const page3 = must(await listClients(db, alpha, { pageSize: 10, page: 3 }));
    expect(page3.items).toHaveLength(6);
    expect(list.counts).toEqual({ all: 26, active: 14, prospect: 12, archived: 0 });
    expect(must(await listClients(db, alpha, { filter: "prospect" })).total).toBe(12);
    expect(must(await listClients(db, alpha, { kind: "privato" })).total).toBe(5);
    expect(must(await listClients(db, alpha, { q: "atelier" })).total).toBe(1);
    expect(must(await listClients(db, alpha, { q: "ciao@atel" })).total).toBe(1);
    expect(must(await listClients(db, alpha, { q: "12345678" })).total).toBe(1);
    expect(must(await listClients(db, alpha, { q: "100%" })).total).toBe(0);
    const noMatch = must(await listClients(db, alpha, { q: "nessun-risultato" }));
    expect(noMatch.total).toBe(0);
    expect(noMatch.workspaceTotal).toBeGreaterThan(0);
  });

  it("gestisce contatti con un solo referente principale e note", async () => {
    const { id } = must(await createClient(db, alpha, { kind: "azienda", name: "Nova Studio" }));
    const first = must(await saveContact(db, alpha, id, null, { name: "Luca Ferri", isPrimary: true }));
    must(await saveContact(db, alpha, id, null, { name: "Sara Bianchi", isPrimary: true }));
    let detail = must(await getClient(db, alpha, id));
    expect(detail.contacts.filter((contact) => contact.isPrimary).map((contact) => contact.name)).toEqual(["Sara Bianchi"]);
    must(await saveContact(db, alpha, id, first.id, { name: "Luca Ferri", roleLabel: "Direttore creativo", isPrimary: false }));
    must(await deleteContact(db, alpha, id, first.id));
    const note = must(await addNote(db, alpha, id, { body: "Interessato alla manutenzione." }));
    detail = must(await getClient(db, alpha, id));
    expect(detail.contacts).toHaveLength(1);
    expect(detail.notes[0]?.body).toBe("Interessato alla manutenzione.");
    must(await deleteNote(db, alpha, id, note.id));
    expect(must(await getClient(db, alpha, id)).notes).toHaveLength(0);
  });

  it("isola clienti, contatti e note tra workspace", async () => {
    const { id } = must(await createClient(db, beta, { kind: "azienda", name: "Cliente Beta" }));
    const contact = must(await saveContact(db, beta, id, null, { name: "Referente Beta" }));
    const note = must(await addNote(db, beta, id, { body: "Nota privata" }));

    expect((await getClient(db, { ...alpha, workspaceId: beta.workspaceId }, id)).ok).toBe(false);
    expect((await getClient(db, alpha, id)).ok).toBe(false);
    expect((await updateClient(db, alpha, id, { kind: "azienda", name: "Rubato" })).ok).toBe(false);
    expect((await setClientArchived(db, alpha, id, true)).ok).toBe(false);
    expect((await deleteClient(db, alpha, id)).ok).toBe(false);
    expect((await saveContact(db, alpha, id, contact.id, { name: "Hack" })).ok).toBe(false);
    expect((await deleteContact(db, alpha, id, contact.id)).ok).toBe(false);
    expect((await addNote(db, alpha, id, { body: "x" })).ok).toBe(false);
    expect((await deleteNote(db, alpha, id, note.id)).ok).toBe(false);
    expect(must(await listClients(db, alpha)).total).toBe(0);

    const intact = must(await getClient(db, beta, id));
    expect(intact.name).toBe("Cliente Beta");
    expect(intact.contacts).toHaveLength(1);
    expect(intact.notes).toHaveLength(1);
  });

  it("applica i ruoli: il membro crea ma non elimina, e cancella solo le proprie note", async () => {
    const member = await joinAs(db, alpha.workspaceId, "membro@example.com", "member");
    const { id } = must(await createClient(db, member, { kind: "privato", name: "Mario Rossi" }));
    const denied = await deleteClient(db, member, id);
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.error).toBe("forbidden");
    const ownerNote = must(await addNote(db, alpha, id, { body: "Nota del proprietario" }));
    const memberNote = must(await addNote(db, member, id, { body: "Nota del membro" }));
    expect((await deleteNote(db, member, id, ownerNote.id)).ok).toBe(false);
    expect((await deleteNote(db, member, id, memberNote.id)).ok).toBe(true);
    const admin = await joinAs(db, alpha.workspaceId, "admin@example.com", "admin");
    expect((await deleteNote(db, admin, id, ownerNote.id)).ok).toBe(true);
    expect((await deleteClient(db, admin, id)).ok).toBe(true);
  });
});
