CREATE TABLE `quote_invoices` (
	`workspace_id` text NOT NULL,
	`quote_id` text NOT NULL,
	`billing_holder` text,
	`billing_vat_number` text,
	`billing_tax_code` text,
	`billing_sdi_code` text,
	`billing_pec` text,
	`billing_address` text,
	`billing_submitted_at` integer,
	`invoice_status` text DEFAULT 'none' NOT NULL,
	`invoice_number` text,
	`invoice_issue_date` text,
	`invoice_due_date` text,
	`invoice_notes` text,
	`invoice_issued_at` integer,
	`pdf_data` blob,
	`pdf_filename` text,
	`pdf_size_bytes` integer,
	`pdf_sha256` text,
	`pdf_uploaded_at` integer,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`workspace_id`, `quote_id`),
	FOREIGN KEY (`workspace_id`,`quote_id`) REFERENCES `quotes`(`workspace_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `quote_payment_settings` ADD `billing_mode` text;--> statement-breakpoint
ALTER TABLE `quote_payment_settings` ADD `payment_terms` text;--> statement-breakpoint
ALTER TABLE `quote_payment_settings` ADD `payment_terms_custom` text;--> statement-breakpoint
ALTER TABLE `workspace_payment_settings` ADD `billing_mode` text;--> statement-breakpoint
ALTER TABLE `workspace_payment_settings` ADD `payment_terms` text;--> statement-breakpoint
ALTER TABLE `workspace_payment_settings` ADD `payment_terms_custom` text;