ALTER TABLE `outbox` ADD `status` text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE `outbox` ADD `error` text;--> statement-breakpoint
ALTER TABLE `outbox` ADD `attempts` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `team` ADD `monday_user_id` text;--> statement-breakpoint
-- Events queued before monday was connected stay in the log but are never sent.
UPDATE `outbox` SET `status` = 'skipped' WHERE `sent_at` IS NULL;
