ALTER TABLE `workspace_memberships` ADD `welcomed_at` integer;--> statement-breakpoint
UPDATE `workspace_memberships` SET `welcomed_at` = `created_at` WHERE `welcomed_at` IS NULL;
