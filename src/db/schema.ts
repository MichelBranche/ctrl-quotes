import { relations, sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

const timestamp = (name: string) => integer(name, { mode: "timestamp_ms" });

const authTimestamp = (name: string) =>
  timestamp(name)
    .notNull()
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`);

export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" }).notNull().default(false),
  image: text("image"),
  createdAt: authTimestamp("created_at"),
  updatedAt: authTimestamp("updated_at"),
});

export const session = sqliteTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: authTimestamp("created_at"),
    updatedAt: authTimestamp("updated_at"),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [index("session_user_id_idx").on(table.userId)],
);

export const account = sqliteTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: authTimestamp("created_at"),
    updatedAt: authTimestamp("updated_at"),
  },
  (table) => [index("account_user_id_idx").on(table.userId)],
);

export const verification = sqliteTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: authTimestamp("created_at"),
    updatedAt: authTimestamp("updated_at"),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);

export const workspaces = sqliteTable(
  "workspaces",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    plan: text("plan").notNull().default("free"),
    taxProfile: text("tax_profile").notNull().default("ordinario"),
    currency: text("currency").notNull().default("EUR"),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
    deletedAt: timestamp("deleted_at"),
  },
  (table) => [
    check("workspaces_plan_chk", sql`${table.plan} in ('free', 'pro', 'studio')`),
    check(
      "workspaces_tax_chk",
      sql`${table.taxProfile} in ('ordinario', 'forfettario', 'estero')`,
    ),
  ],
);

export const workspaceMemberships = sqliteTable(
  "workspace_memberships",
  {
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    createdAt: timestamp("created_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.userId] }),
    check("membership_role_chk", sql`${table.role} in ('owner', 'admin', 'member')`),
  ],
);

export const subscriptions = sqliteTable("subscriptions", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id")
    .notNull()
    .unique()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  status: text("status").notNull().default("none"),
  periodEnd: timestamp("period_end"),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
});

export const subscriptionEvents = sqliteTable("subscription_events", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  eventId: text("event_id").notNull().unique(),
  type: text("type").notNull(),
  payload: text("payload").notNull(),
  createdAt: timestamp("created_at").notNull(),
});

export const usageCounters = sqliteTable(
  "usage_counters",
  {
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    metric: text("metric").notNull(),
    period: text("period").notNull(),
    value: integer("value").notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.workspaceId, table.metric, table.period] })],
);

export const clients = sqliteTable(
  "clients",
  {
    id: text("id").notNull(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    name: text("name").notNull(),
    vatNumber: text("vat_number"),
    taxCode: text("tax_code"),
    status: text("status").notNull().default("active"),
    sector: text("sector"),
    email: text("email"),
    phone: text("phone"),
    website: text("website"),
    address: text("address"),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
    deletedAt: timestamp("deleted_at"),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.id] }),
    index("clients_name_idx").on(table.workspaceId, table.name),
    index("clients_status_idx").on(table.workspaceId, table.status),
    check("clients_kind_chk", sql`${table.kind} in ('azienda', 'privato')`),
    check("clients_status_chk", sql`${table.status} in ('active', 'prospect', 'archived')`),
  ],
);

export const clientContacts = sqliteTable(
  "client_contacts",
  {
    id: text("id").notNull(),
    workspaceId: text("workspace_id").notNull(),
    clientId: text("client_id").notNull(),
    name: text("name").notNull(),
    email: text("email"),
    phone: text("phone"),
    roleLabel: text("role_label"),
    isPrimary: integer("is_primary", { mode: "boolean" }).notNull().default(false),
    createdAt: timestamp("created_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.id] }),
    foreignKey({
      columns: [table.workspaceId, table.clientId],
      foreignColumns: [clients.workspaceId, clients.id],
    }).onDelete("cascade"),
  ],
);

export const clientNotes = sqliteTable(
  "client_notes",
  {
    id: text("id").notNull(),
    workspaceId: text("workspace_id").notNull(),
    clientId: text("client_id").notNull(),
    body: text("body").notNull(),
    authorUserId: text("author_user_id").references(() => user.id),
    createdAt: timestamp("created_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.id] }),
    foreignKey({
      columns: [table.workspaceId, table.clientId],
      foreignColumns: [clients.workspaceId, clients.id],
    }).onDelete("cascade"),
  ],
);

export const catalogCategories = sqliteTable(
  "catalog_categories",
  {
    id: text("id").notNull(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: timestamp("created_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.id] }),
    uniqueIndex("catalog_categories_name_uq").on(table.workspaceId, table.name),
  ],
);

export const catalogItems = sqliteTable(
  "catalog_items",
  {
    id: text("id").notNull(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    unit: text("unit"),
    unitPriceCents: integer("unit_price_cents").notNull(),
    priceMode: text("price_mode").notNull().default("net"),
    taxRateBp: integer("tax_rate_bp").notNull().default(2200),
    taxNature: text("tax_nature"),
    billing: text("billing").notNull().default("una_tantum"),
    periods: integer("periods"),
    optionalDefault: integer("optional_default", { mode: "boolean" }).notNull().default(false),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
    deletedAt: timestamp("deleted_at"),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.id] }),
    index("catalog_items_type_idx").on(table.workspaceId, table.type),
    check("catalog_type_chk", sql`${table.type} in ('servizio', 'prodotto', 'pacchetto')`),
    check("catalog_price_mode_chk", sql`${table.priceMode} in ('net', 'gross')`),
    check("catalog_billing_chk", sql`${table.billing} in ('una_tantum', 'mensile', 'annuale')`),
  ],
);

export const catalogPackageItems = sqliteTable(
  "catalog_package_items",
  {
    id: text("id").notNull(),
    workspaceId: text("workspace_id").notNull(),
    packageId: text("package_id").notNull(),
    itemId: text("item_id").notNull(),
    quantityMilli: integer("quantity_milli").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.id] }),
    foreignKey({
      columns: [table.workspaceId, table.packageId],
      foreignColumns: [catalogItems.workspaceId, catalogItems.id],
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.workspaceId, table.itemId],
      foreignColumns: [catalogItems.workspaceId, catalogItems.id],
    }).onDelete("cascade"),
  ],
);

export const brandKits = sqliteTable("brand_kits", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id")
    .notNull()
    .unique()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  logoAssetId: text("logo_asset_id"),
  colorPrimary: text("color_primary").notNull().default("#0B0B0F"),
  colorSecondary: text("color_secondary").notNull().default("#7C3AED"),
  colorBackground: text("color_background").notNull().default("#F4F2FF"),
  fontHeading: text("font_heading").notNull().default("Inter"),
  fontBody: text("font_body").notNull().default("Inter"),
  companyName: text("company_name"),
  vatNumber: text("vat_number"),
  taxCode: text("tax_code"),
  address: text("address"),
  email: text("email"),
  phone: text("phone"),
  website: text("website"),
  quoteNumberFormat: text("quote_number_format").notNull().default("QT-{YYYY}-{0000}"),
  defaultTerms: text("default_terms"),
  applyAutomatically: integer("apply_automatically", { mode: "boolean" }).notNull().default(true),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
});

export const templates = sqliteTable("templates", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  version: integer("version").notNull().default(1),
  createdAt: timestamp("created_at").notNull(),
});

export const templatePresets = sqliteTable(
  "template_presets",
  {
    id: text("id").notNull(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    templateId: text("template_id")
      .notNull()
      .references(() => templates.id),
    name: text("name").notNull(),
    optionsJson: text("options_json").notNull().default("{}"),
    isDefault: integer("is_default", { mode: "boolean" }).notNull().default(false),
    createdAt: timestamp("created_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.workspaceId, table.id] })],
);

export const quotes = sqliteTable(
  "quotes",
  {
    id: text("id").notNull(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    clientId: text("client_id"),
    number: text("number"),
    title: text("title").notNull(),
    status: text("status").notNull().default("draft"),
    currentVersionId: text("current_version_id"),
    validUntil: timestamp("valid_until"),
    ownerId: text("owner_id").references(() => user.id),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
    deletedAt: timestamp("deleted_at"),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.id] }),
    uniqueIndex("quotes_number_uq").on(table.workspaceId, table.number),
    index("quotes_status_idx").on(table.workspaceId, table.status, table.updatedAt),
    foreignKey({
      columns: [table.workspaceId, table.clientId],
      foreignColumns: [clients.workspaceId, clients.id],
    }),
    check(
      "quotes_status_chk",
      sql`${table.status} in ('draft', 'pending', 'changes_requested', 'accepted', 'rejected', 'expired', 'revoked')`,
    ),
  ],
);

export const quoteDrafts = sqliteTable(
  "quote_drafts",
  {
    workspaceId: text("workspace_id").notNull(),
    quoteId: text("quote_id").notNull(),
    revision: integer("revision").notNull().default(1),
    blocksJson: text("blocks_json").notNull().default("[]"),
    updatedAt: timestamp("updated_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.quoteId] }),
    foreignKey({
      columns: [table.workspaceId, table.quoteId],
      foreignColumns: [quotes.workspaceId, quotes.id],
    }).onDelete("cascade"),
  ],
);

export const quoteSections = sqliteTable(
  "quote_sections",
  {
    id: text("id").notNull(),
    workspaceId: text("workspace_id").notNull(),
    quoteId: text("quote_id").notNull(),
    sortOrder: integer("sort_order").notNull(),
    type: text("type").notNull(),
    visible: integer("visible", { mode: "boolean" }).notNull().default(true),
    contentJson: text("content_json").notNull().default("{}"),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.id] }),
    foreignKey({
      columns: [table.workspaceId, table.quoteId],
      foreignColumns: [quotes.workspaceId, quotes.id],
    }).onDelete("cascade"),
  ],
);

export const quoteLineItems = sqliteTable(
  "quote_line_items",
  {
    id: text("id").notNull(),
    workspaceId: text("workspace_id").notNull(),
    quoteId: text("quote_id").notNull(),
    sectionId: text("section_id"),
    catalogItemId: text("catalog_item_id"),
    name: text("name").notNull(),
    description: text("description"),
    quantityMilli: integer("quantity_milli").notNull(),
    unitPriceCents: integer("unit_price_cents").notNull(),
    priceMode: text("price_mode").notNull(),
    taxRateBp: integer("tax_rate_bp").notNull(),
    discountBp: integer("discount_bp").notNull().default(0),
    billing: text("billing").notNull(),
    optional: integer("optional", { mode: "boolean" }).notNull().default(false),
    sortOrder: integer("sort_order").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.id] }),
    foreignKey({
      columns: [table.workspaceId, table.quoteId],
      foreignColumns: [quotes.workspaceId, quotes.id],
    }).onDelete("cascade"),
  ],
);

export const quoteVersions = sqliteTable(
  "quote_versions",
  {
    id: text("id").notNull(),
    workspaceId: text("workspace_id").notNull(),
    quoteId: text("quote_id").notNull(),
    versionNo: integer("version_no").notNull(),
    snapshotJson: text("snapshot_json").notNull(),
    snapshotSha256: text("snapshot_sha256").notNull(),
    rendererVersion: text("renderer_version").notNull(),
    totalsJson: text("totals_json").notNull(),
    publishedBy: text("published_by"),
    createdAt: timestamp("created_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.id] }),
    uniqueIndex("quote_versions_no_uq").on(table.quoteId, table.versionNo),
    foreignKey({
      columns: [table.workspaceId, table.quoteId],
      foreignColumns: [quotes.workspaceId, quotes.id],
    }),
  ],
);

export const quotePublicLinks = sqliteTable(
  "quote_public_links",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull(),
    quoteId: text("quote_id").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    recipientEmail: text("recipient_email"),
    expiresAt: timestamp("expires_at"),
    revokedAt: timestamp("revoked_at"),
    createdAt: timestamp("created_at").notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.workspaceId, table.quoteId],
      foreignColumns: [quotes.workspaceId, quotes.id],
    }).onDelete("cascade"),
  ],
);

export const quoteEvents = sqliteTable(
  "quote_events",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull(),
    quoteId: text("quote_id").notNull(),
    type: text("type").notNull(),
    actor: text("actor").notNull(),
    actorUserId: text("actor_user_id"),
    versionId: text("version_id"),
    meta: text("meta"),
    dedupeKey: text("dedupe_key").unique(),
    createdAt: timestamp("created_at").notNull(),
  },
  (table) => [
    index("quote_events_quote_idx").on(table.quoteId, table.createdAt),
    index("quote_events_workspace_idx").on(table.workspaceId, table.createdAt),
    check("quote_events_actor_chk", sql`${table.actor} in ('user', 'recipient', 'system')`),
  ],
);

export const quoteAcceptances = sqliteTable("quote_acceptances", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  quoteId: text("quote_id").notNull(),
  decision: text("decision").notNull(),
  versionId: text("version_id").notNull(),
  signerName: text("signer_name").notNull(),
  signerEmail: text("signer_email").notNull(),
  optionsJson: text("options_json").notNull(),
  totalsSha256: text("totals_sha256").notNull(),
  termsSha256: text("terms_sha256").notNull(),
  consentText: text("consent_text").notNull(),
  ip: text("ip"),
  userAgent: text("user_agent"),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  createdAt: timestamp("created_at").notNull(),
}, (table) => [
  uniqueIndex("quote_acceptances_quote_uq").on(table.workspaceId, table.quoteId),
  check("quote_acceptances_decision_chk", sql`${table.decision} in ('accepted', 'rejected')`),
]);

export const quoteChangeRequests = sqliteTable("quote_change_requests", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  quoteId: text("quote_id").notNull(),
  versionId: text("version_id").notNull(),
  message: text("message").notNull(),
  status: text("status").notNull().default("open"),
  resolvedByVersionId: text("resolved_by_version_id"),
  createdAt: timestamp("created_at").notNull(),
}, (table) => [index("quote_change_requests_quote_idx").on(table.quoteId)]);

export const quoteNumberSequences = sqliteTable(
  "quote_number_sequences",
  {
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    year: integer("year").notNull(),
    lastValue: integer("last_value").notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.workspaceId, table.year] })],
);

export const assets = sqliteTable(
  "assets",
  {
    id: text("id").notNull(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    blobKey: text("blob_key").notNull(),
    sha256: text("sha256").notNull(),
    mime: text("mime").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    filename: text("filename").notNull(),
    createdAt: timestamp("created_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.workspaceId, table.id] })],
);

export const emailDeliveries = sqliteTable("email_deliveries", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id"),
  toAddress: text("to_address").notNull(),
  subject: text("subject").notNull(),
  templateKey: text("template_key"),
  status: text("status").notNull(),
  providerId: text("provider_id"),
  error: text("error"),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
});

export const outboxJobs = sqliteTable(
  "outbox_jobs",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id"),
    type: text("type").notNull(),
    payload: text("payload").notNull(),
    status: text("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(5),
    nextRunAt: timestamp("next_run_at").notNull(),
    lastError: text("last_error"),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
  },
  (table) => [
    index("outbox_jobs_due_idx").on(table.status, table.nextRunAt),
    check(
      "outbox_status_chk",
      sql`${table.status} in ('pending', 'running', 'succeeded', 'failed')`,
    ),
  ],
);

export const auditLogs = sqliteTable(
  "audit_logs",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id"),
    actorUserId: text("actor_user_id"),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    meta: text("meta"),
    createdAt: timestamp("created_at").notNull(),
  },
  (table) => [index("audit_logs_workspace_idx").on(table.workspaceId, table.createdAt)],
);

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
  memberships: many(workspaceMemberships),
}));

export const schema = {
  user,
  session,
  account,
  verification,
  workspaces,
  workspaceMemberships,
  subscriptions,
  subscriptionEvents,
  usageCounters,
  clients,
  clientContacts,
  clientNotes,
  catalogCategories,
  catalogItems,
  catalogPackageItems,
  brandKits,
  templates,
  templatePresets,
  quotes,
  quoteDrafts,
  quoteSections,
  quoteLineItems,
  quoteVersions,
  quotePublicLinks,
  quoteEvents,
  quoteAcceptances,
  quoteChangeRequests,
  quoteNumberSequences,
  assets,
  emailDeliveries,
  outboxJobs,
  auditLogs,
};
