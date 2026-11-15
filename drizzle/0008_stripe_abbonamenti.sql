CREATE TABLE `stripe_processed_events` (
	`event_id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`workspace_id` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `subscriptions` ADD `plan` text;--> statement-breakpoint
ALTER TABLE `subscriptions` ADD `cancel_at_period_end` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `subscriptions` ADD `stripe_price_id` text;