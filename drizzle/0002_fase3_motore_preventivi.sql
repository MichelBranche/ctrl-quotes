ALTER TABLE `quotes` ADD `template_id` text REFERENCES templates(id);--> statement-breakpoint
ALTER TABLE `quotes` ADD `total_cents` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `quotes` ADD `recurring_cents` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX `quotes_client_idx` ON `quotes` (`workspace_id`,`client_id`,`updated_at`);