CREATE TABLE `offer_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`client_id` text NOT NULL,
	`service` text NOT NULL,
	`action` text NOT NULL,
	`trigger` text,
	`request_id` integer,
	`asked_by` text,
	`at` integer NOT NULL,
	`handled_at` integer,
	`handled_by` text
);
--> statement-breakpoint
ALTER TABLE `clients` ADD `services` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `clients` ADD `offers_on` integer DEFAULT true NOT NULL;