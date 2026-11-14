import { and, asc, count, desc, eq, isNull, ne, or, sql, type SQL } from "drizzle-orm";
import type { AppDatabase } from "@/db/client";
import { clientContacts, clientNotes, clients, quotes, user } from "@/db/schema";
import {
  clientInputSchema,
  contactInputSchema,
  firstIssue,
  likePattern,
  noteInputSchema,
  type ClientFilter,
  type ClientKind,
  type ClientStatus,
} from "@/domain/clients";
import { createId } from "@/domain/ids";
import { can } from "@/domain/permissions";
import { authorize, invalid, notFound, ok, type Actor, type Result } from "@/server/access";
import { writeAuditLog } from "@/server/audit";

export type ClientRow = {
  id: string;
  kind: ClientKind;
  name: string;
  status: ClientStatus;
  sector: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  address: string | null;
  vatNumber: string | null;
  taxCode: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type ClientContact = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  roleLabel: string | null;
  isPrimary: boolean;
};

export type ClientNote = {
  id: string;
  body: string;
  authorName: string | null;
  authorUserId: string | null;
  createdAt: Date;
  canDelete: boolean;
};

export type ClientDetail = ClientRow & { contacts: ClientContact[]; notes: ClientNote[] };

export const clientSorts = ["name", "-name", "updated", "-updated"] as const;
export type ClientSort = (typeof clientSorts)[number];

export type ClientListItem = ClientRow & { quoteCount: number };

export type ClientListQuery = {
  sort?: ClientSort;
  q?: string;
  filter?: ClientFilter;
  kind?: ClientKind | "all";
  page?: number;
  pageSize?: number;
};

export type ClientList = {
  items: ClientListItem[];
  total: number;
  page: number;
  pageSize: number;
  counts: Record<ClientFilter, number>;
  /** Clienti non eliminati nel workspace, senza ricerca né filtri. */
  workspaceTotal: number;
};

const clientColumns = {
  id: clients.id,
  kind: clients.kind,
  name: clients.name,
  status: clients.status,
  sector: clients.sector,
  email: clients.email,
  phone: clients.phone,
  website: clients.website,
  address: clients.address,
  vatNumber: clients.vatNumber,
  taxCode: clients.taxCode,
  createdAt: clients.createdAt,
  updatedAt: clients.updatedAt,
};

function asRow(row: Omit<ClientRow, "kind" | "status"> & { kind: string; status: string }): ClientRow {
  return {
    ...row,
    kind: row.kind === "privato" ? "privato" : "azienda",
    status: row.status === "prospect" ? "prospect" : row.status === "archived" ? "archived" : "active",
  };
}

function searchCondition(q: string | undefined): SQL | undefined {
  const query = q?.trim();
  if (!query) return undefined;
  const pattern = likePattern(query);
  return or(
    sql`${clients.name} like ${pattern} escape '\\'`,
    sql`coalesce(${clients.email}, '') like ${pattern} escape '\\'`,
    sql`coalesce(${clients.vatNumber}, '') like ${pattern} escape '\\'`,
    sql`coalesce(${clients.sector}, '') like ${pattern} escape '\\'`,
    sql`coalesce(${clients.phone}, '') like ${pattern} escape '\\'`,
  );
}

function filterCondition(filter: ClientFilter): SQL {
  switch (filter) {
    case "all":
      return ne(clients.status, "archived");
    case "active":
      return eq(clients.status, "active");
    case "prospect":
      return eq(clients.status, "prospect");
    case "archived":
      return eq(clients.status, "archived");
    default: {
      const exhaustive: never = filter;
      throw new Error(`Filtro sconosciuto: ${String(exhaustive)}`);
    }
  }
}

export async function listClients(
  db: AppDatabase,
  actor: Actor,
  query: ClientListQuery = {},
): Promise<Result<ClientList>> {
  const access = await authorize(db, actor, "clients.read");
  if (!access.ok) return access;
  const filter = query.filter ?? "all";
  const pageSize = Math.min(Math.max(query.pageSize ?? 20, 1), 100);
  const page = Math.max(query.page ?? 1, 1);
  const base = [eq(clients.workspaceId, actor.workspaceId), isNull(clients.deletedAt)];
  const search = searchCondition(query.q);
  const kind = query.kind && query.kind !== "all" ? eq(clients.kind, query.kind) : undefined;
  const where = and(...base, filterCondition(filter), search, kind);

  const sort = query.sort ?? "name";
  const order =
    sort === "-name"
      ? [desc(sql`lower(${clients.name})`), asc(clients.id)]
      : sort === "updated"
        ? [desc(clients.updatedAt), asc(clients.id)]
        : sort === "-updated"
          ? [asc(clients.updatedAt), asc(clients.id)]
          : [asc(sql`lower(${clients.name})`), asc(clients.id)];
  // Quotes per client, counted inside the same workspace only.
  const quoteCount = sql<number>`(select count(*) from "quotes" as "q" where "q"."workspace_id" = "clients"."workspace_id" and "q"."client_id" = "clients"."id" and "q"."deleted_at" is null)`;

  const [items, totalRows, countRows, workspaceRows] = await Promise.all([
    db
      .select({ ...clientColumns, quoteCount })
      .from(clients)
      .where(where)
      .orderBy(...order)
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ value: count() }).from(clients).where(where),
    db
      .select({ status: clients.status, value: count() })
      .from(clients)
      .where(and(...base, search, kind))
      .groupBy(clients.status),
    db.select({ value: count() }).from(clients).where(and(...base)),
  ]);

  const counts: Record<ClientFilter, number> = { all: 0, active: 0, prospect: 0, archived: 0 };
  for (const row of countRows) {
    if (row.status === "active" || row.status === "prospect" || row.status === "archived") {
      counts[row.status] = row.value;
    }
  }
  counts.all = counts.active + counts.prospect;

  return ok({
    items: items.map(({ quoteCount: quoteTotal, ...row }) => ({ ...asRow(row), quoteCount: Number(quoteTotal) || 0 })),
    total: totalRows[0]?.value ?? 0,
    page,
    pageSize,
    counts,
    workspaceTotal: workspaceRows[0]?.value ?? 0,
  });
}

async function findClient(db: AppDatabase, workspaceId: string, clientId: string) {
  const rows = await db
    .select(clientColumns)
    .from(clients)
    .where(and(eq(clients.workspaceId, workspaceId), eq(clients.id, clientId), isNull(clients.deletedAt)));
  return rows[0] ? asRow(rows[0]) : null;
}

export async function getClient(db: AppDatabase, actor: Actor, clientId: string): Promise<Result<ClientDetail>> {
  const access = await authorize(db, actor, "clients.read");
  if (!access.ok) return access;
  const client = await findClient(db, actor.workspaceId, clientId);
  if (!client) return notFound("Cliente non trovato.");
  const [contacts, notes] = await Promise.all([
    db
      .select({
        id: clientContacts.id,
        name: clientContacts.name,
        email: clientContacts.email,
        phone: clientContacts.phone,
        roleLabel: clientContacts.roleLabel,
        isPrimary: clientContacts.isPrimary,
      })
      .from(clientContacts)
      .where(and(eq(clientContacts.workspaceId, actor.workspaceId), eq(clientContacts.clientId, clientId)))
      .orderBy(desc(clientContacts.isPrimary), asc(clientContacts.createdAt)),
    db
      .select({
        id: clientNotes.id,
        body: clientNotes.body,
        authorUserId: clientNotes.authorUserId,
        authorName: user.name,
        createdAt: clientNotes.createdAt,
      })
      .from(clientNotes)
      .leftJoin(user, eq(user.id, clientNotes.authorUserId))
      .where(and(eq(clientNotes.workspaceId, actor.workspaceId), eq(clientNotes.clientId, clientId)))
      .orderBy(desc(clientNotes.createdAt)),
  ]);
  const isAdmin = can(access.value.role, "clients.delete");
  return ok({
    ...client,
    contacts,
    notes: notes.map((note) => ({ ...note, canDelete: isAdmin || note.authorUserId === actor.userId })),
  });
}

export async function createClient(db: AppDatabase, actor: Actor, input: unknown): Promise<Result<{ id: string }>> {
  const access = await authorize(db, actor, "clients.write");
  if (!access.ok) return access;
  const parsed = clientInputSchema.safeParse(input);
  if (!parsed.success) return invalid(firstIssue(parsed.error));
  const id = createId();
  const now = new Date();
  await db.insert(clients).values({ id, workspaceId: actor.workspaceId, ...parsed.data, createdAt: now, updatedAt: now });
  await writeAuditLog(db, {
    workspaceId: actor.workspaceId,
    actorUserId: actor.userId,
    action: "client.created",
    entityType: "client",
    entityId: id,
  });
  return ok({ id });
}

export async function updateClient(
  db: AppDatabase,
  actor: Actor,
  clientId: string,
  input: unknown,
): Promise<Result<{ id: string }>> {
  const access = await authorize(db, actor, "clients.write");
  if (!access.ok) return access;
  const existing = await findClient(db, actor.workspaceId, clientId);
  if (!existing) return notFound("Cliente non trovato.");
  const parsed = clientInputSchema.safeParse(input);
  if (!parsed.success) return invalid(firstIssue(parsed.error));
  const status = existing.status === "archived" ? "archived" : parsed.data.status;
  await db
    .update(clients)
    .set({ ...parsed.data, status, updatedAt: new Date() })
    .where(and(eq(clients.workspaceId, actor.workspaceId), eq(clients.id, clientId)));
  await writeAuditLog(db, {
    workspaceId: actor.workspaceId,
    actorUserId: actor.userId,
    action: "client.updated",
    entityType: "client",
    entityId: clientId,
  });
  return ok({ id: clientId });
}

export async function setClientArchived(
  db: AppDatabase,
  actor: Actor,
  clientId: string,
  archived: boolean,
): Promise<Result<{ id: string }>> {
  const access = await authorize(db, actor, "clients.write");
  if (!access.ok) return access;
  const existing = await findClient(db, actor.workspaceId, clientId);
  if (!existing) return notFound("Cliente non trovato.");
  await db
    .update(clients)
    .set({ status: archived ? "archived" : "active", updatedAt: new Date() })
    .where(and(eq(clients.workspaceId, actor.workspaceId), eq(clients.id, clientId)));
  await writeAuditLog(db, {
    workspaceId: actor.workspaceId,
    actorUserId: actor.userId,
    action: archived ? "client.archived" : "client.restored",
    entityType: "client",
    entityId: clientId,
  });
  return ok({ id: clientId });
}

/** Archives or restores several clients at once. Ids outside the actor's workspace are ignored. */
export async function setClientsArchived(
  db: AppDatabase,
  actor: Actor,
  clientIds: string[],
  archived: boolean,
): Promise<Result<{ count: number }>> {
  const access = await authorize(db, actor, "clients.write");
  if (!access.ok) return access;
  const ids = [...new Set(clientIds.filter((value) => typeof value === "string" && value.length > 0 && value.length <= 64))].slice(0, 100);
  if (ids.length === 0) return invalid("Seleziona almeno un cliente.");
  let count = 0;
  for (const id of ids) {
    const result = await setClientArchived(db, actor, id, archived);
    if (result.ok) count += 1;
  }
  return ok({ count });
}

/** Soft delete. Quotes in later phases keep their own snapshot of the client. */
export async function deleteClient(db: AppDatabase, actor: Actor, clientId: string): Promise<Result<{ id: string }>> {
  const access = await authorize(db, actor, "clients.delete");
  if (!access.ok) return access;
  const existing = await findClient(db, actor.workspaceId, clientId);
  if (!existing) return notFound("Cliente non trovato.");
  const now = new Date();
  await db
    .update(clients)
    .set({ deletedAt: now, updatedAt: now })
    .where(and(eq(clients.workspaceId, actor.workspaceId), eq(clients.id, clientId)));
  await writeAuditLog(db, {
    workspaceId: actor.workspaceId,
    actorUserId: actor.userId,
    action: "client.deleted",
    entityType: "client",
    entityId: clientId,
  });
  return ok({ id: clientId });
}

async function touchClient(db: AppDatabase, workspaceId: string, clientId: string) {
  await db
    .update(clients)
    .set({ updatedAt: new Date() })
    .where(and(eq(clients.workspaceId, workspaceId), eq(clients.id, clientId)));
}

async function clearPrimary(db: AppDatabase, workspaceId: string, clientId: string) {
  await db
    .update(clientContacts)
    .set({ isPrimary: false })
    .where(and(eq(clientContacts.workspaceId, workspaceId), eq(clientContacts.clientId, clientId)));
}

export async function saveContact(
  db: AppDatabase,
  actor: Actor,
  clientId: string,
  contactId: string | null,
  input: unknown,
): Promise<Result<{ id: string }>> {
  const access = await authorize(db, actor, "clients.write");
  if (!access.ok) return access;
  const client = await findClient(db, actor.workspaceId, clientId);
  if (!client) return notFound("Cliente non trovato.");
  const parsed = contactInputSchema.safeParse(input);
  if (!parsed.success) return invalid(firstIssue(parsed.error));
  if (parsed.data.isPrimary) await clearPrimary(db, actor.workspaceId, clientId);
  let id = contactId;
  if (id) {
    const updated = await db
      .update(clientContacts)
      .set(parsed.data)
      .where(
        and(
          eq(clientContacts.workspaceId, actor.workspaceId),
          eq(clientContacts.clientId, clientId),
          eq(clientContacts.id, id),
        ),
      )
      .returning({ id: clientContacts.id });
    if (updated.length === 0) return notFound("Contatto non trovato.");
  } else {
    id = createId();
    await db.insert(clientContacts).values({
      id,
      workspaceId: actor.workspaceId,
      clientId,
      ...parsed.data,
      createdAt: new Date(),
    });
  }
  await touchClient(db, actor.workspaceId, clientId);
  return ok({ id });
}

export async function deleteContact(
  db: AppDatabase,
  actor: Actor,
  clientId: string,
  contactId: string,
): Promise<Result<{ id: string }>> {
  const access = await authorize(db, actor, "clients.write");
  if (!access.ok) return access;
  const removed = await db
    .delete(clientContacts)
    .where(
      and(
        eq(clientContacts.workspaceId, actor.workspaceId),
        eq(clientContacts.clientId, clientId),
        eq(clientContacts.id, contactId),
      ),
    )
    .returning({ id: clientContacts.id });
  if (removed.length === 0) return notFound("Contatto non trovato.");
  await touchClient(db, actor.workspaceId, clientId);
  return ok({ id: contactId });
}

export async function addNote(
  db: AppDatabase,
  actor: Actor,
  clientId: string,
  input: unknown,
): Promise<Result<{ id: string }>> {
  const access = await authorize(db, actor, "clients.write");
  if (!access.ok) return access;
  const client = await findClient(db, actor.workspaceId, clientId);
  if (!client) return notFound("Cliente non trovato.");
  const parsed = noteInputSchema.safeParse(input);
  if (!parsed.success) return invalid(firstIssue(parsed.error));
  const id = createId();
  await db.insert(clientNotes).values({
    id,
    workspaceId: actor.workspaceId,
    clientId,
    body: parsed.data.body,
    authorUserId: actor.userId,
    createdAt: new Date(),
  });
  await touchClient(db, actor.workspaceId, clientId);
  return ok({ id });
}

export async function deleteNote(
  db: AppDatabase,
  actor: Actor,
  clientId: string,
  noteId: string,
): Promise<Result<{ id: string }>> {
  const access = await authorize(db, actor, "clients.write");
  if (!access.ok) return access;
  const rows = await db
    .select({ authorUserId: clientNotes.authorUserId })
    .from(clientNotes)
    .where(
      and(eq(clientNotes.workspaceId, actor.workspaceId), eq(clientNotes.clientId, clientId), eq(clientNotes.id, noteId)),
    );
  const note = rows[0];
  if (!note) return notFound("Nota non trovata.");
  if (note.authorUserId !== actor.userId && !can(access.value.role, "clients.delete")) {
    return { ok: false, error: "forbidden", message: "Puoi eliminare solo le tue note." };
  }
  await db
    .delete(clientNotes)
    .where(and(eq(clientNotes.workspaceId, actor.workspaceId), eq(clientNotes.id, noteId)));
  return ok({ id: noteId });
}

/** Rows used by CSV deduplication: only non-deleted clients of the workspace. */
export async function clientDedupKeys(db: AppDatabase, workspaceId: string) {
  return db
    .select({ id: clients.id, name: clients.name, email: clients.email, vatNumber: clients.vatNumber })
    .from(clients)
    .where(and(eq(clients.workspaceId, workspaceId), isNull(clients.deletedAt)));
}

export type ClientStats = {
  /** Clients not archived and not deleted. */
  total: number;
  active: number;
  prospect: number;
  archived: number;
  createdThisMonth: number;
  createdLastMonth: number;
  /**
   * Running total of clients that exist today, by creation month (oldest first, `months` points).
   * Only creation dates are stored, so status history is not available.
   */
  growth: number[];
};

function monthKey(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit" }).formatToParts(date);
  return `${parts.find((part) => part.type === "year")?.value}-${parts.find((part) => part.type === "month")?.value}`;
}

function lastMonths(now: Date, months: number): string[] {
  const [year, month] = monthKey(now).split("-").map(Number) as [number, number];
  const keys: string[] = [];
  for (let back = months - 1; back >= 0; back -= 1) {
    const index = year * 12 + (month - 1) - back;
    keys.push(`${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`);
  }
  return keys;
}

/** Address book KPIs for the current workspace, from real rows only. */
export async function clientStats(db: AppDatabase, actor: Actor, now = new Date(), months = 8): Promise<Result<ClientStats>> {
  const access = await authorize(db, actor, "clients.read");
  if (!access.ok) return access;
  const rows = await db
    .select({ status: clients.status, createdAt: clients.createdAt })
    .from(clients)
    .where(and(eq(clients.workspaceId, actor.workspaceId), isNull(clients.deletedAt)));
  const keys = lastMonths(now, months);
  const perMonth = new Map<string, number>(keys.map((key) => [key, 0]));
  let before = 0;
  const stats = { total: 0, active: 0, prospect: 0, archived: 0, createdThisMonth: 0, createdLastMonth: 0 };
  for (const row of rows) {
    if (row.status === "archived") stats.archived += 1;
    else {
      stats.total += 1;
      if (row.status === "prospect") stats.prospect += 1;
      else stats.active += 1;
    }
    const key = monthKey(row.createdAt);
    if (perMonth.has(key)) perMonth.set(key, (perMonth.get(key) ?? 0) + 1);
    else if (key < keys[0]!) before += 1;
    if (key === keys[keys.length - 1]) stats.createdThisMonth += 1;
    if (key === keys[keys.length - 2]) stats.createdLastMonth += 1;
  }
  let running = before;
  const growth = keys.map((key) => (running += perMonth.get(key) ?? 0));
  return ok({ ...stats, growth });
}

export type ClientEvent = {
  at: Date;
  kind: "client_created" | "note_added" | "quote_created" | "quote_sent" | "quote_viewed" | "quote_accepted" | "quote_rejected";
  label: string;
  quoteId?: string;
};

/** Real history of a client: creation, notes and the stored milestones of its quotes. Newest first. */
export async function clientTimeline(db: AppDatabase, actor: Actor, clientId: string): Promise<Result<ClientEvent[]>> {
  const access = await authorize(db, actor, "clients.read");
  if (!access.ok) return access;
  const client = await findClient(db, actor.workspaceId, clientId);
  if (!client) return notFound("Cliente non trovato.");
  const [noteRows, quoteRows] = await Promise.all([
    db
      .select({ createdAt: clientNotes.createdAt })
      .from(clientNotes)
      .where(and(eq(clientNotes.workspaceId, actor.workspaceId), eq(clientNotes.clientId, clientId))),
    db
      .select({
        id: quotes.id,
        number: quotes.number,
        title: quotes.title,
        status: quotes.status,
        createdAt: quotes.createdAt,
        sentAt: quotes.sentAt,
        firstViewedAt: quotes.firstViewedAt,
        decidedAt: quotes.decidedAt,
      })
      .from(quotes)
      .where(and(eq(quotes.workspaceId, actor.workspaceId), eq(quotes.clientId, clientId), isNull(quotes.deletedAt))),
  ]);
  const events: ClientEvent[] = [{ at: client.createdAt, kind: "client_created", label: "Cliente aggiunto alla rubrica" }];
  for (const note of noteRows) events.push({ at: note.createdAt, kind: "note_added", label: "Nota interna aggiunta" });
  for (const quote of quoteRows) {
    const name = quote.number ? `${quote.number} · ${quote.title}` : quote.title;
    events.push({ at: quote.createdAt, kind: "quote_created", label: `Preventivo creato: ${name}`, quoteId: quote.id });
    if (quote.sentAt) events.push({ at: quote.sentAt, kind: "quote_sent", label: `Preventivo inviato: ${name}`, quoteId: quote.id });
    if (quote.firstViewedAt) events.push({ at: quote.firstViewedAt, kind: "quote_viewed", label: `Preventivo aperto dal cliente: ${name}`, quoteId: quote.id });
    if (quote.decidedAt && (quote.status === "accepted" || quote.status === "rejected")) {
      events.push({
        at: quote.decidedAt,
        kind: quote.status === "accepted" ? "quote_accepted" : "quote_rejected",
        label: `${quote.status === "accepted" ? "Preventivo accettato" : "Preventivo rifiutato"}: ${name}`,
        quoteId: quote.id,
      });
    }
  }
  return ok(events.sort((a, b) => b.at.getTime() - a.at.getTime()));
}
