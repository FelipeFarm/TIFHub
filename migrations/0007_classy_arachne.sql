ALTER TABLE `approval_items` ADD `link_url` text;--> statement-breakpoint
ALTER TABLE `approval_items` ADD `body` text;--> statement-breakpoint
ALTER TABLE `approvals` ADD `kind` text DEFAULT 'posts' NOT NULL;