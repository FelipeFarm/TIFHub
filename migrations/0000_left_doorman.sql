CREATE TABLE `approval_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`approval_id` integer NOT NULL,
	`position` integer NOT NULL,
	`caption` text NOT NULL,
	`when_label` text,
	`image_key` text,
	`decision` text DEFAULT 'pending' NOT NULL,
	`comment` text,
	`previous_comment` text
);
--> statement-breakpoint
CREATE TABLE `approvals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`client_id` text NOT NULL,
	`service` text DEFAULT 'social' NOT NULL,
	`title` text NOT NULL,
	`note` text,
	`due` text,
	`status` text DEFAULT 'sent' NOT NULL,
	`owner_id` text,
	`sent_at` integer NOT NULL,
	`reviewed_by` text,
	`reviewed_at` integer
);
--> statement-breakpoint
CREATE TABLE `attachments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`client_id` text NOT NULL,
	`request_id` integer,
	`message_id` integer,
	`approval_id` integer,
	`key` text NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`size` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `attachments_key_unique` ON `attachments` (`key`);--> statement-breakpoint
CREATE TABLE `clients` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`login_email` text NOT NULL,
	`password_hash` text NOT NULL,
	`lead_id` text,
	`backup_id` text,
	`monday_group_id` text,
	`ghl_contact_id` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `clients_login_email_unique` ON `clients` (`login_email`);--> statement-breakpoint
CREATE TABLE `messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`request_id` integer NOT NULL,
	`author_type` text NOT NULL,
	`author_name` text NOT NULL,
	`body` text NOT NULL,
	`internal` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `outbox` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`target` text NOT NULL,
	`kind` text NOT NULL,
	`request_id` integer,
	`approval_id` integer,
	`summary` text NOT NULL,
	`payload` text NOT NULL,
	`created_at` integer NOT NULL,
	`sent_at` integer
);
--> statement-breakpoint
CREATE TABLE `requests` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`client_id` text NOT NULL,
	`service` text NOT NULL,
	`type` text,
	`title` text NOT NULL,
	`details` text NOT NULL,
	`page_url` text,
	`urgency` text NOT NULL,
	`asked_by` text NOT NULL,
	`channel` text DEFAULT 'hub' NOT NULL,
	`status` text DEFAULT 'received' NOT NULL,
	`status_line` text,
	`expected` text,
	`need_text` text,
	`need_action` text,
	`owner_id` text,
	`reply_by` integer NOT NULL,
	`first_reply_at` integer,
	`client_replied_at` integer,
	`monday_item_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`done_at` integer
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_type` text NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `team` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`initials` text NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`role` text DEFAULT 'account_lead' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `team_email_unique` ON `team` (`email`);