CREATE TABLE `audit_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`at` integer NOT NULL,
	`actor` text NOT NULL,
	`action` text NOT NULL,
	`target` text,
	`detail` text,
	`ip` text
);
--> statement-breakpoint
CREATE TABLE `login_attempts` (
	`key` text PRIMARY KEY NOT NULL,
	`fails` integer NOT NULL,
	`first_fail_at` integer NOT NULL,
	`locked_until` integer
);
--> statement-breakpoint
CREATE TABLE `login_links` (
	`id` text PRIMARY KEY NOT NULL,
	`user_type` text NOT NULL,
	`user_id` text NOT NULL,
	`purpose` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`used_at` integer
);
--> statement-breakpoint
ALTER TABLE `clients` ADD `active` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `sessions` ADD `created_at` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `team` ADD `active` integer DEFAULT true NOT NULL;--> statement-breakpoint
-- Sessions are now stored as hashes; old ones would never match, so clear them (everyone signs in again).
DELETE FROM `sessions`;
