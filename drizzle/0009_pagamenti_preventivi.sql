CREATE TABLE `workspace_payment_settings` (
	`workspace_id` text PRIMARY KEY NOT NULL,
	`iban_enabled` integer DEFAULT false NOT NULL,
	`iban_holder` text,
	`iban` text,
	`bic` text,
	`iban_causale_template` text DEFAULT 'Preventivo {numero}' NOT NULL,
	`paypal_enabled` integer DEFAULT false NOT NULL,
	`paypal_mode` text,
	`paypal_value` text,
	`stripe_account_id` text,
	`stripe_account_status` text DEFAULT 'none' NOT NULL,
	`default_methods` text DEFAULT '[]' NOT NULL,
	`show_before_acceptance` integer DEFAULT false NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `quote_payment_settings` (
	`workspace_id` text NOT NULL,
	`quote_id` text NOT NULL,
	`methods` text DEFAULT '[]' NOT NULL,
	`deposit_mode` text DEFAULT 'full' NOT NULL,
	`deposit_bp` integer,
	`deposit_cents` integer,
	`show_before_acceptance` integer DEFAULT false NOT NULL,
	`snapshot_json` text,
	`payment_status` text DEFAULT 'none' NOT NULL,
	`amount_due_cents` integer,
	`amount_paid_cents` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`workspace_id`, `quote_id`),
	FOREIGN KEY (`workspace_id`,`quote_id`) REFERENCES `quotes`(`workspace_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `quote_payment_events` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`quote_id` text NOT NULL,
	`method` text NOT NULL,
	`kind` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`stripe_session_id` text,
	`stripe_payment_intent_id` text,
	`actor_user_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`,`quote_id`) REFERENCES `quotes`(`workspace_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `quote_payment_events_quote_idx` ON `quote_payment_events` (`workspace_id`,`quote_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX `quote_payment_events_session_idx` ON `quote_payment_events` (`stripe_session_id`);
