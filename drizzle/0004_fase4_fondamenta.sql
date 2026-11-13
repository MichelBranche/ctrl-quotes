-- Fase 4, fondamenta: solo aggiunte. Colonne nuove facoltative o con default, tre tabelle nuove.
-- L'indice unico delle accettazioni passa da "una per preventivo" a "una per versione": nessuna riga cambia.
CREATE TABLE `notification_prefs` (
	`user_id` text NOT NULL,
	`workspace_id` text NOT NULL,
	`email_on_view` text DEFAULT 'first' NOT NULL,
	`email_on_decision` integer DEFAULT true NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `workspace_id`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "notification_prefs_view_chk" CHECK("notification_prefs"."email_on_view" in ('never', 'first', 'every'))
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`user_id` text NOT NULL,
	`quote_id` text,
	`event_id` text,
	`type` text NOT NULL,
	`read_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `notifications_user_idx` ON `notifications` (`user_id`,`workspace_id`,`read_at`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `notifications_event_user_uq` ON `notifications` (`event_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`window_start` integer NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `rate_limits_expires_idx` ON `rate_limits` (`expires_at`);--> statement-breakpoint
DROP INDEX `quote_acceptances_quote_uq`;--> statement-breakpoint
ALTER TABLE `quote_acceptances` ADD `link_id` text;--> statement-breakpoint
ALTER TABLE `quote_acceptances` ADD `snapshot_sha256` text;--> statement-breakpoint
ALTER TABLE `quote_acceptances` ADD `note` text;--> statement-breakpoint
CREATE UNIQUE INDEX `quote_acceptances_version_uq` ON `quote_acceptances` (`workspace_id`,`version_id`);--> statement-breakpoint
CREATE INDEX `quote_acceptances_quote_idx` ON `quote_acceptances` (`workspace_id`,`quote_id`);--> statement-breakpoint
ALTER TABLE `email_deliveries` ADD `quote_id` text;--> statement-breakpoint
ALTER TABLE `email_deliveries` ADD `link_id` text;--> statement-breakpoint
ALTER TABLE `email_deliveries` ADD `kind` text;--> statement-breakpoint
ALTER TABLE `quote_change_requests` ADD `link_id` text;--> statement-breakpoint
ALTER TABLE `quote_change_requests` ADD `author_name` text;--> statement-breakpoint
ALTER TABLE `quote_public_links` ADD `token_enc` text;--> statement-breakpoint
ALTER TABLE `quote_public_links` ADD `token_hint` text;--> statement-breakpoint
ALTER TABLE `quote_public_links` ADD `created_by` text;--> statement-breakpoint
ALTER TABLE `quote_public_links` ADD `revoked_by` text;--> statement-breakpoint
ALTER TABLE `quote_public_links` ADD `replaced_by_link_id` text;--> statement-breakpoint
ALTER TABLE `quote_public_links` ADD `first_viewed_at` integer;--> statement-breakpoint
ALTER TABLE `quote_public_links` ADD `last_viewed_at` integer;--> statement-breakpoint
ALTER TABLE `quote_public_links` ADD `view_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX `quote_public_links_quote_idx` ON `quote_public_links` (`workspace_id`,`quote_id`);--> statement-breakpoint
ALTER TABLE `quotes` ADD `sent_version_id` text;--> statement-breakpoint
ALTER TABLE `quotes` ADD `sent_at` integer;--> statement-breakpoint
ALTER TABLE `quotes` ADD `first_viewed_at` integer;--> statement-breakpoint
ALTER TABLE `quotes` ADD `last_viewed_at` integer;--> statement-breakpoint
ALTER TABLE `quotes` ADD `decided_at` integer;--> statement-breakpoint
ALTER TABLE `quotes` ADD `view_count` integer DEFAULT 0 NOT NULL;