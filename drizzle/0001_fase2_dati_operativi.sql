CREATE TABLE `asset_blobs` (
	`workspace_id` text NOT NULL,
	`asset_id` text NOT NULL,
	`data` blob NOT NULL,
	PRIMARY KEY(`workspace_id`, `asset_id`),
	FOREIGN KEY (`workspace_id`,`asset_id`) REFERENCES `assets`(`workspace_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `template_favorites` (
	`workspace_id` text NOT NULL,
	`template_id` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`workspace_id`, `template_id`),
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`template_id`) REFERENCES `templates`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `workspace_settings` (
	`workspace_id` text PRIMARY KEY NOT NULL,
	`default_tax_rate_bp` integer DEFAULT 2200 NOT NULL,
	`default_price_mode` text DEFAULT 'net' NOT NULL,
	`default_validity_days` integer DEFAULT 30 NOT NULL,
	`stamp_duty_note` integer DEFAULT true NOT NULL,
	`number_reset` text DEFAULT 'yearly' NOT NULL,
	`default_template_id` text,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`default_template_id`) REFERENCES `templates`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "ws_settings_price_mode_chk" CHECK("workspace_settings"."default_price_mode" in ('net', 'gross')),
	CONSTRAINT "ws_settings_reset_chk" CHECK("workspace_settings"."number_reset" in ('yearly', 'never')),
	CONSTRAINT "ws_settings_validity_chk" CHECK("workspace_settings"."default_validity_days" between 1 and 365)
);
--> statement-breakpoint
ALTER TABLE `catalog_items` ADD `category_id` text;--> statement-breakpoint
CREATE INDEX `catalog_items_category_idx` ON `catalog_items` (`workspace_id`,`category_id`);--> statement-breakpoint
INSERT OR IGNORE INTO `templates` (`id`, `key`, `name`, `description`, `version`, `created_at`) VALUES ('tpl_minimal', 'minimal', 'Minimal', 'Pulito, essenziale e professionale. Ideale per qualsiasi settore.', 1, 1794470400000);--> statement-breakpoint
INSERT OR IGNORE INTO `templates` (`id`, `key`, `name`, `description`, `version`, `created_at`) VALUES ('tpl_editorial', 'editorial', 'Editorial', 'Elegante e curato nei dettagli, con tipografia protagonista. Perfetto per brand e studi creativi.', 1, 1794470400000);--> statement-breakpoint
INSERT OR IGNORE INTO `templates` (`id`, `key`, `name`, `description`, `version`, `created_at`) VALUES ('tpl_corporate', 'corporate', 'Corporate', 'Strutturato, affidabile e istituzionale. Pensato per aziende e team.', 1, 1794470400000);--> statement-breakpoint
INSERT OR IGNORE INTO `templates` (`id`, `key`, `name`, `description`, `version`, `created_at`) VALUES ('tpl_bold', 'bold', 'Bold', 'Deciso, dinamico e ad alto contrasto. Per proposte che si fanno notare.', 1, 1794470400000);
