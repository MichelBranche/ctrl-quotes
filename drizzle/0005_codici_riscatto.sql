CREATE TABLE `redeem_code_uses` (
	`id` text PRIMARY KEY NOT NULL,
	`code_id` text NOT NULL,
	`workspace_id` text NOT NULL,
	`user_id` text NOT NULL,
	`redeemed_at` integer NOT NULL,
	FOREIGN KEY (`code_id`) REFERENCES `redeem_codes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `redeem_code_uses_user_uq` ON `redeem_code_uses` (`code_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `redeem_code_uses_workspace_idx` ON `redeem_code_uses` (`workspace_id`);--> statement-breakpoint
CREATE TABLE `redeem_codes` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`kind` text NOT NULL,
	`days` integer,
	`plan` text NOT NULL,
	`max_uses` integer DEFAULT 1 NOT NULL,
	`used_count` integer DEFAULT 0 NOT NULL,
	`expires_at` integer,
	`created_at` integer NOT NULL,
	CONSTRAINT "redeem_codes_kind_chk" CHECK("redeem_codes"."kind" in ('free_month', 'lifetime')),
	CONSTRAINT "redeem_codes_plan_chk" CHECK("redeem_codes"."plan" in ('starter', 'pro', 'business')),
	CONSTRAINT "redeem_codes_days_chk" CHECK(("redeem_codes"."kind" = 'lifetime' and "redeem_codes"."days" is null) or ("redeem_codes"."kind" = 'free_month' and "redeem_codes"."days" > 0)),
	CONSTRAINT "redeem_codes_uses_chk" CHECK("redeem_codes"."max_uses" > 0 and "redeem_codes"."used_count" >= 0 and "redeem_codes"."used_count" <= "redeem_codes"."max_uses")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `redeem_codes_code_uq` ON `redeem_codes` (`code`);--> statement-breakpoint
ALTER TABLE `workspaces` ADD `plan_override` text;--> statement-breakpoint
ALTER TABLE `workspaces` ADD `plan_override_until` integer;