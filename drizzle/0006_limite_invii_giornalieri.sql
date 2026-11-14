CREATE TABLE `quote_send_daily_counts` (
	`day` text NOT NULL,
	`kind` text NOT NULL,
	`user_id` text NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`day`, `kind`, `user_id`),
	CONSTRAINT "quote_send_daily_kind_chk" CHECK("quote_send_daily_counts"."kind" in ('user', 'global')),
	CONSTRAINT "quote_send_daily_count_chk" CHECK("quote_send_daily_counts"."count" >= 0)
);
