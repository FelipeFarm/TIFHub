ALTER TABLE `clients` ADD `notify_email` text;--> statement-breakpoint
ALTER TABLE `clients` ADD `emails_on` integer DEFAULT false NOT NULL;--> statement-breakpoint
-- Email events queued before GHL was connected used an older format; they are never sent.
UPDATE `outbox` SET `status` = 'skipped', `error` = 'Queued before GHL was connected' WHERE `target` = 'ghl' AND `status` = 'pending';
