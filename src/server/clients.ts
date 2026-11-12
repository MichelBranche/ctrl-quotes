import { and, asc, count, desc, eq, isNull, ne, or, sql, type SQL } from "drizzle-orm";
import type { AppDatabase } from "@/db/client";
import { clientContacts, clientNotes, clients, user } from "@/db/schema";
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

export type ClientListQuery = {
  q?: string;
  filter?: ClientFilter;
  kind?: ClientKind | "all";
  page?: number;
  pageSize?: number;
};

export type ClientList = {
  items: ClientRow[];
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

  const [items, totalRows, countRows, workspaceRows] = await Promise.all([
    db
      .select(clientColumns)
      .from(clients)
      .where(where)
      .orderBy(asc(sql`lower(${clients.name})`), asc(clients.id))
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
    items: items.map(asRow),
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
