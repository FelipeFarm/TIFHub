import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

/** Idea Farm team members who sign in to the team side. */
export const team = sqliteTable("team", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  initials: text("initials").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("account_lead"),
});

/** One row per client company. One shared login per company. */
export const clients = sqliteTable("clients", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  loginEmail: text("login_email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  leadId: text("lead_id"),
  backupId: text("backup_id"),
  // Filled in during step 4 (monday + GHL connection).
  mondayGroupId: text("monday_group_id"),
  ghlContactId: text("ghl_contact_id"),
  createdAt: integer("created_at").notNull(),
});

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  userType: text("user_type").notNull(), // "client" | "team"
  userId: text("user_id").notNull(),
  expiresAt: integer("expires_at").notNull(),
});

/**
 * status: received | in_progress | your_turn | done
 * urgency: no_rush | this_week | urgent
 * channel: hub | email | phone | text | meeting  (how the request came in)
 */
export const requests = sqliteTable("requests", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  clientId: text("client_id").notNull(),
  service: text("service").notNull(),
  type: text("type"),
  title: text("title").notNull(),
  details: text("details").notNull(),
  pageUrl: text("page_url"),
  urgency: text("urgency").notNull(),
  askedBy: text("asked_by").notNull(),
  channel: text("channel").notNull().default("hub"),
  status: text("status").notNull().default("received"),
  statusLine: text("status_line"), // "Theo is updating the page" — shown to the client
  expected: text("expected"), // YYYY-MM-DD
  needText: text("need_text"), // what we need from the client when status = your_turn
  needAction: text("need_action"), // button label: Upload files | Reply | Approve
  ownerId: text("owner_id"),
  replyBy: integer("reply_by").notNull(),
  firstReplyAt: integer("first_reply_at"),
  clientRepliedAt: integer("client_replied_at"),
  mondayItemId: text("monday_item_id"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
  doneAt: integer("done_at"),
});

/** authorType: client | team | system. Internal notes are never shown to clients. */
export const messages = sqliteTable("messages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  requestId: integer("request_id").notNull(),
  authorType: text("author_type").notNull(),
  authorName: text("author_name").notNull(),
  body: text("body").notNull(),
  internal: integer("internal", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at").notNull(),
});

export const attachments = sqliteTable("attachments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  clientId: text("client_id").notNull(),
  requestId: integer("request_id"),
  messageId: integer("message_id"),
  approvalId: integer("approval_id"),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  type: text("type").notNull(),
  size: integer("size").notNull(),
  createdAt: integer("created_at").notNull(),
});

/** status: sent (waiting on client) | reviewed (client answered) | closed */
export const approvals = sqliteTable("approvals", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  clientId: text("client_id").notNull(),
  service: text("service").notNull().default("social"),
  title: text("title").notNull(),
  note: text("note"),
  due: text("due"), // YYYY-MM-DD
  status: text("status").notNull().default("sent"),
  ownerId: text("owner_id"),
  sentAt: integer("sent_at").notNull(),
  reviewedBy: text("reviewed_by"),
  reviewedAt: integer("reviewed_at"),
});

/** decision: pending | approved | changes */
export const approvalItems = sqliteTable("approval_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  approvalId: integer("approval_id").notNull(),
  position: integer("position").notNull(),
  caption: text("caption").notNull(),
  whenLabel: text("when_label"),
  imageKey: text("image_key"),
  decision: text("decision").notNull().default("pending"),
  comment: text("comment"),
  previousComment: text("previous_comment"),
});

/**
 * Everything the Hub will send to GHL (client emails) and monday (items, updates).
 * In this trial build nothing leaves the app: events wait here until step 4 connects them.
 */
export const outbox = sqliteTable("outbox", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  target: text("target").notNull(), // ghl | monday
  kind: text("kind").notNull(),
  requestId: integer("request_id"),
  approvalId: integer("approval_id"),
  summary: text("summary").notNull(),
  payload: text("payload").notNull(),
  createdAt: integer("created_at").notNull(),
  sentAt: integer("sent_at"),
});

export type Team = typeof team.$inferSelect;
export type Client = typeof clients.$inferSelect;
export type Request = typeof requests.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type Attachment = typeof attachments.$inferSelect;
export type Approval = typeof approvals.$inferSelect;
export type ApprovalItem = typeof approvalItems.$inferSelect;
