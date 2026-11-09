CREATE TABLE `account` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `account_user_id_idx` ON `account` (`user_id`);--> statement-breakpoint
CREATE TABLE `assets` (
	`id` text NOT NULL,
	`workspace_id` text NOT NULL,
	`blob_key` text NOT NULL,
	`sha256` text NOT NULL,
	`mime` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`filename` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`workspace_id`, `id`),
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text,
	`actor_user_id` text,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text,
	`meta` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_logs_workspace_idx` ON `audit_logs` (`workspace_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `brand_kits` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`logo_asset_id` text,
	`color_primary` text DEFAULT '#0B0B0F' NOT NULL,
	`color_secondary` text DEFAULT '#7C3AED' NOT NULL,
	`color_background` text DEFAULT '#F4F2FF' NOT NULL,
	`font_heading` text DEFAULT 'Inter' NOT NULL,
	`font_body` text DEFAULT 'Inter' NOT NULL,
	`company_name` text,
	`vat_number` text,
	`tax_code` text,
	`address` text,
	`email` text,
	`phone` text,
	`website` text,
	`quote_number_format` text DEFAULT 'QT-{YYYY}-{0000}' NOT NULL,
	`default_terms` text,
	`apply_automatically` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `brand_kits_workspace_id_unique` ON `brand_kits` (`workspace_id`);--> statement-breakpoint
CREATE TABLE `catalog_categories` (
	`id` text NOT NULL,
	`workspace_id` text NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`workspace_id`, `id`),
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `catalog_categories_name_uq` ON `catalog_categories` (`workspace_id`,`name`);--> statement-breakpoint
CREATE TABLE `catalog_items` (
	`id` text NOT NULL,
	`workspace_id` text NOT NULL,
	`type` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`unit` text,
	`unit_price_cents` integer NOT NULL,
	`price_mode` text DEFAULT 'net' NOT NULL,
	`tax_rate_bp` integer DEFAULT 2200 NOT NULL,
	`tax_nature` text,
	`billing` text DEFAULT 'una_tantum' NOT NULL,
	`periods` integer,
	`optional_default` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	PRIMARY KEY(`workspace_id`, `id`),
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "catalog_type_chk" CHECK("catalog_items"."type" in ('servizio', 'prodotto', 'pacchetto')),
	CONSTRAINT "catalog_price_mode_chk" CHECK("catalog_items"."price_mode" in ('net', 'gross')),
	CONSTRAINT "catalog_billing_chk" CHECK("catalog_items"."billing" in ('una_tantum', 'mensile', 'annuale'))
);
--> statement-breakpoint
CREATE INDEX `catalog_items_type_idx` ON `catalog_items` (`workspace_id`,`type`);--> statement-breakpoint
CREATE TABLE `catalog_package_items` (
	`id` text NOT NULL,
	`workspace_id` text NOT NULL,
	`package_id` text NOT NULL,
	`item_id` text NOT NULL,
	`quantity_milli` integer NOT NULL,
	PRIMARY KEY(`workspace_id`, `id`),
	FOREIGN KEY (`workspace_id`,`package_id`) REFERENCES `catalog_items`(`workspace_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`workspace_id`,`item_id`) REFERENCES `catalog_items`(`workspace_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `client_contacts` (
	`id` text NOT NULL,
	`workspace_id` text NOT NULL,
	`client_id` text NOT NULL,
	`name` text NOT NULL,
	`email` text,
	`phone` text,
	`role_label` text,
	`is_primary` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`workspace_id`, `id`),
	FOREIGN KEY (`workspace_id`,`client_id`) REFERENCES `clients`(`workspace_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `client_notes` (
	`id` text NOT NULL,
	`workspace_id` text NOT NULL,
	`client_id` text NOT NULL,
	`body` text NOT NULL,
	`author_user_id` text,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`workspace_id`, `id`),
	FOREIGN KEY (`author_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`client_id`) REFERENCES `clients`(`workspace_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `clients` (
	`id` text NOT NULL,
	`workspace_id` text NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`vat_number` text,
	`tax_code` text,
	`status` text DEFAULT 'active' NOT NULL,
	`sector` text,
	`email` text,
	`phone` text,
	`website` text,
	`address` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	PRIMARY KEY(`workspace_id`, `id`),
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "clients_kind_chk" CHECK("clients"."kind" in ('azienda', 'privato')),
	CONSTRAINT "clients_status_chk" CHECK("clients"."status" in ('active', 'prospect', 'archived'))
);
--> statement-breakpoint
CREATE INDEX `clients_name_idx` ON `clients` (`workspace_id`,`name`);--> statement-breakpoint
CREATE INDEX `clients_status_idx` ON `clients` (`workspace_id`,`status`);--> statement-breakpoint
CREATE TABLE `email_deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text,
	`to_address` text NOT NULL,
	`subject` text NOT NULL,
	`template_key` text,
	`status` text NOT NULL,
	`provider_id` text,
	`error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `outbox_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text,
	`type` text NOT NULL,
	`payload` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`max_attempts` integer DEFAULT 5 NOT NULL,
	`next_run_at` integer NOT NULL,
	`last_error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "outbox_status_chk" CHECK("outbox_jobs"."status" in ('pending', 'running', 'succeeded', 'failed'))
);
--> statement-breakpoint
CREATE INDEX `outbox_jobs_due_idx` ON `outbox_jobs` (`status`,`next_run_at`);--> statement-breakpoint
CREATE TABLE `quote_acceptances` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`quote_id` text NOT NULL,
	`decision` text NOT NULL,
	`version_id` text NOT NULL,
	`signer_name` text NOT NULL,
	`signer_email` text NOT NULL,
	`options_json` text NOT NULL,
	`totals_sha256` text NOT NULL,
	`terms_sha256` text NOT NULL,
	`consent_text` text NOT NULL,
	`ip` text,
	`user_agent` text,
	`idempotency_key` text NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT "quote_acceptances_decision_chk" CHECK("quote_acceptances"."decision" in ('accepted', 'rejected'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `quote_acceptances_idempotency_key_unique` ON `quote_acceptances` (`idempotency_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `quote_acceptances_quote_uq` ON `quote_acceptances` (`workspace_id`,`quote_id`);--> statement-breakpoint
CREATE TABLE `quote_change_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`quote_id` text NOT NULL,
	`version_id` text NOT NULL,
	`message` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`resolved_by_version_id` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `quote_change_requests_quote_idx` ON `quote_change_requests` (`quote_id`);--> statement-breakpoint
CREATE TABLE `quote_drafts` (
	`workspace_id` text NOT NULL,
	`quote_id` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`blocks_json` text DEFAULT '[]' NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`workspace_id`, `quote_id`),
	FOREIGN KEY (`workspace_id`,`quote_id`) REFERENCES `quotes`(`workspace_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `quote_events` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`quote_id` text NOT NULL,
	`type` text NOT NULL,
	`actor` text NOT NULL,
	`actor_user_id` text,
	`version_id` text,
	`meta` text,
	`dedupe_key` text,
	`created_at` integer NOT NULL,
	CONSTRAINT "quote_events_actor_chk" CHECK("quote_events"."actor" in ('user', 'recipient', 'system'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `quote_events_dedupe_key_unique` ON `quote_events` (`dedupe_key`);--> statement-breakpoint
CREATE INDEX `quote_events_quote_idx` ON `quote_events` (`quote_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `quote_events_workspace_idx` ON `quote_events` (`workspace_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `quote_line_items` (
	`id` text NOT NULL,
	`workspace_id` text NOT NULL,
	`quote_id` text NOT NULL,
	`section_id` text,
	`catalog_item_id` text,
	`name` text NOT NULL,
	`description` text,
	`quantity_milli` integer NOT NULL,
	`unit_price_cents` integer NOT NULL,
	`price_mode` text NOT NULL,
	`tax_rate_bp` integer NOT NULL,
	`discount_bp` integer DEFAULT 0 NOT NULL,
	`billing` text NOT NULL,
	`optional` integer DEFAULT false NOT NULL,
	`sort_order` integer NOT NULL,
	PRIMARY KEY(`workspace_id`, `id`),
	FOREIGN KEY (`workspace_id`,`quote_id`) REFERENCES `quotes`(`workspace_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `quote_number_sequences` (
	`workspace_id` text NOT NULL,
	`year` integer NOT NULL,
	`last_value` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`workspace_id`, `year`),
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `quote_public_links` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`quote_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`recipient_email` text,
	`expires_at` integer,
	`revoked_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`,`quote_id`) REFERENCES `quotes`(`workspace_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `quote_public_links_token_hash_unique` ON `quote_public_links` (`token_hash`);--> statement-breakpoint
CREATE TABLE `quote_sections` (
	`id` text NOT NULL,
	`workspace_id` text NOT NULL,
	`quote_id` text NOT NULL,
	`sort_order` integer NOT NULL,
	`type` text NOT NULL,
	`visible` integer DEFAULT true NOT NULL,
	`content_json` text DEFAULT '{}' NOT NULL,
	PRIMARY KEY(`workspace_id`, `id`),
	FOREIGN KEY (`workspace_id`,`quote_id`) REFERENCES `quotes`(`workspace_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `quote_versions` (
	`id` text NOT NULL,
	`workspace_id` text NOT NULL,
	`quote_id` text NOT NULL,
	`version_no` integer NOT NULL,
	`snapshot_json` text NOT NULL,
	`snapshot_sha256` text NOT NULL,
	`renderer_version` text NOT NULL,
	`totals_json` text NOT NULL,
	`published_by` text,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`workspace_id`, `id`),
	FOREIGN KEY (`workspace_id`,`quote_id`) REFERENCES `quotes`(`workspace_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `quote_versions_no_uq` ON `quote_versions` (`quote_id`,`version_no`);--> statement-breakpoint
CREATE TABLE `quotes` (
	`id` text NOT NULL,
	`workspace_id` text NOT NULL,
	`client_id` text,
	`number` text,
	`title` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`current_version_id` text,
	`valid_until` integer,
	`owner_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	PRIMARY KEY(`workspace_id`, `id`),
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`owner_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`workspace_id`,`client_id`) REFERENCES `clients`(`workspace_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "quotes_status_chk" CHECK("quotes"."status" in ('draft', 'pending', 'changes_requested', 'accepted', 'rejected', 'expired', 'revoked'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `quotes_number_uq` ON `quotes` (`workspace_id`,`number`);--> statement-breakpoint
CREATE INDEX `quotes_status_idx` ON `quotes` (`workspace_id`,`status`,`updated_at`);--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);--> statement-breakpoint
CREATE INDEX `session_user_id_idx` ON `session` (`user_id`);--> statement-breakpoint
CREATE TABLE `subscription_events` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`event_id` text NOT NULL,
	`type` text NOT NULL,
	`payload` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `subscription_events_event_id_unique` ON `subscription_events` (`event_id`);--> statement-breakpoint
CREATE TABLE `subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`stripe_customer_id` text,
	`stripe_subscription_id` text,
	`status` text DEFAULT 'none' NOT NULL,
	`period_end` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `subscriptions_workspace_id_unique` ON `subscriptions` (`workspace_id`);--> statement-breakpoint
CREATE TABLE `template_presets` (
	`id` text NOT NULL,
	`workspace_id` text NOT NULL,
	`template_id` text NOT NULL,
	`name` text NOT NULL,
	`options_json` text DEFAULT '{}' NOT NULL,
	`is_default` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`workspace_id`, `id`),
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`template_id`) REFERENCES `templates`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `templates` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `templates_key_unique` ON `templates` (`key`);--> statement-breakpoint
CREATE TABLE `usage_counters` (
	`workspace_id` text NOT NULL,
	`metric` text NOT NULL,
	`period` text NOT NULL,
	`value` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`workspace_id`, `metric`, `period`),
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `verification_identifier_idx` ON `verification` (`identifier`);--> statement-breakpoint
CREATE TABLE `workspace_memberships` (
	`workspace_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`workspace_id`, `user_id`),
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "membership_role_chk" CHECK("workspace_memberships"."role" in ('owner', 'admin', 'member'))
);
--> statement-breakpoint
CREATE TABLE `workspaces` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`plan` text DEFAULT 'free' NOT NULL,
	`tax_profile` text DEFAULT 'ordinario' NOT NULL,
	`currency` text DEFAULT 'EUR' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	CONSTRAINT "workspaces_plan_chk" CHECK("workspaces"."plan" in ('free', 'pro', 'studio')),
	CONSTRAINT "workspaces_tax_chk" CHECK("workspaces"."tax_profile" in ('ordinario', 'forfettario', 'estero'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workspaces_slug_unique` ON `workspaces` (`slug`);
--> statement-breakpoint
CREATE TRIGGER `audit_logs_no_update`
BEFORE UPDATE ON `audit_logs`
BEGIN
  SELECT RAISE(ABORT, 'audit_logs e append-only');
END;
--> statement-breakpoint
CREATE TRIGGER `audit_logs_no_delete`
BEFORE DELETE ON `audit_logs`
BEGIN
  SELECT RAISE(ABORT, 'audit_logs e append-only');
END;
--> statement-breakpoint
CREATE TRIGGER `quote_versions_no_update`
BEFORE UPDATE ON `quote_versions`
BEGIN
  SELECT RAISE(ABORT, 'quote_versions e immutabile');
END;
--> statement-breakpoint
CREATE TRIGGER `quote_versions_no_delete`
BEFORE DELETE ON `quote_versions`
BEGIN
  SELECT RAISE(ABORT, 'quote_versions e immutabile');
END;