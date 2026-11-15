ALTER TABLE `workspaces` ADD `trial_ends_at` integer;--> statement-breakpoint
ALTER TABLE `workspaces` ADD `onboarding_completed_at` integer;--> statement-breakpoint
ALTER TABLE `workspaces` ADD `onboarding_step` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `workspaces` ADD `trial_reminder_sent_at` integer;--> statement-breakpoint
ALTER TABLE `workspaces` ADD `trial_expired_sent_at` integer;--> statement-breakpoint
UPDATE `workspaces` SET
  `trial_ends_at` = (CAST(strftime('%s', 'now') AS integer) * 1000) + 604800000,
  `onboarding_completed_at` = CAST(strftime('%s', 'now') AS integer) * 1000
WHERE `deleted_at` IS NULL AND `trial_ends_at` IS NULL;
