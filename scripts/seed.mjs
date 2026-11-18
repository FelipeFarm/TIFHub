// Generates seed/seed.sql with sample clients, team, requests and approvals,
// plus seed/dev-logins.txt with freshly generated test passwords.
// Everything here is made-up sample data for local testing.
import { pbkdf2Sync, randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";

const ITER = 100_000;
const hash = (pw) => {
  const salt = randomBytes(16);
  return `pbkdf2$${ITER}$${salt.toString("hex")}$${pbkdf2Sync(pw, salt, ITER, 32, "sha256").toString("hex")}`;
};
const pw = () => randomBytes(9).toString("base64url");
const q = (v) => (v === null || v === undefined ? "NULL" : typeof v === "number" ? String(v) : `'${String(v).replace(/'/g, "''")}'`);
const insert = (table, rows) =>
  rows.map((r) => `INSERT INTO ${table} (${Object.keys(r).join(", ")}) VALUES (${Object.values(r).map(q).join(", ")});`).join("\n");

const now = Date.now();
const H = 3_600_000, D = 24 * H;
const dateIn = (days) => new Date(now + days * D).toISOString().slice(0, 10);
const nextBiz = (ms) => { let t = ms + D; while ([0, 6].includes(new Date(t).getUTCDay())) t += D; return t; };

const logins = [];
const account = (label, email) => { const p = pw(); logins.push(`${label.padEnd(22)} ${email.padEnd(30)} ${p}`); return hash(p); };

const team = [
  { id: "t_marisol", name: "Marisol Reyes", initials: "MR", email: "marisol@ideafarm.test", password_hash: account("Team: Marisol", "marisol@ideafarm.test"), role: "admin" },
  { id: "t_theo", name: "Theo Kim", initials: "TK", email: "theo@ideafarm.test", password_hash: account("Team: Theo", "theo@ideafarm.test"), role: "account_lead" },
];
const clients = [
  { id: "c_ridgeline", name: "Ridgeline Roofing", login_email: "office@ridgeline.test", password_hash: account("Client: Ridgeline", "office@ridgeline.test"), lead_id: "t_marisol", backup_id: "t_theo", created_at: now - 90 * D },
  { id: "c_coastal", name: "Coastal Dental", login_email: "front@coastaldental.test", password_hash: account("Client: Coastal", "front@coastaldental.test"), lead_id: "t_theo", backup_id: "t_marisol", created_at: now - 60 * D },
  { id: "c_bluegrass", name: "Bluegrass HVAC", login_email: "hello@bluegrasshvac.test", password_hash: account("Client: Bluegrass", "hello@bluegrasshvac.test"), lead_id: "t_marisol", backup_id: "t_theo", created_at: now - 120 * D },
];

const R = (o) => ({
  type: null, page_url: null, channel: "hub", status_line: null, expected: null, need_text: null, need_action: null,
  owner_id: null, first_reply_at: null, client_replied_at: null, monday_item_id: null, done_at: null,
  reply_by: o.urgency === "urgent" ? o.created_at + 2 * H : nextBiz(o.created_at), updated_at: o.created_at, ...o,
});
const requests = [
  R({ id: 1, client_id: "c_ridgeline", service: "web", type: "feature", title: "Add a storm damage landing page", details: "We'd like a page for storm damage repair. Lots of calls after the October hail.", urgency: "no_rush", asked_by: "Dana Whitfield", status: "your_turn", need_text: "2–3 photos of storm repairs you've done. Phone photos are fine.", need_action: "Upload files", owner_id: "t_theo", expected: dateIn(8), created_at: now - 12 * D, first_reply_at: now - 11 * D, updated_at: now - 6 * D }),
  R({ id: 2, client_id: "c_ridgeline", service: "seo", type: "gbp", title: "Wrong phone number on our Google profile", details: "Google still shows our old number (555) 010-1180. Should be (555) 010-2040.", urgency: "this_week", asked_by: "Chris Lane", status: "in_progress", status_line: "Fixed, waiting for Google to update (1–3 days)", owner_id: "t_marisol", created_at: now - 2 * D, first_reply_at: now - 2 * D + 3 * H, updated_at: now - 1 * D }),
  R({ id: 3, client_id: "c_ridgeline", service: "ads", type: "budget", title: "Pause ads over Thanksgiving week", details: "We're closed Wed–Sun of Thanksgiving week. Can you pause the ads those days?", urgency: "this_week", asked_by: "Dana Whitfield", status: "received", created_at: now - 1 * H }),
  R({ id: 4, client_id: "c_coastal", service: "web", type: "bug", title: "Booking form isn't sending emails", details: "Patients say they booked online but we never got the email. Started yesterday I think.", page_url: "coastaldental.test/book", urgency: "urgent", asked_by: "Priya Shah", status: "received", created_at: now - 3 * H }),
  R({ id: 5, client_id: "c_coastal", service: "social", type: "idea", title: "Post about our new Saturday hours", details: "We're open Saturdays 9–1 starting next month. Can we post about it?", urgency: "no_rush", asked_by: "Priya Shah", status: "in_progress", status_line: "Theo is designing the post", expected: dateIn(2), owner_id: "t_theo", created_at: now - 3 * D, first_reply_at: now - 3 * D + 4 * H, client_replied_at: now - 20 * 60_000, updated_at: now - 20 * 60_000 }),
  R({ id: 6, client_id: "c_bluegrass", service: "web", type: "content", title: "Update the warranty line on the Services page", details: "The warranty line still says 5 years. We now offer 10 years parts and labor on all new installs.", page_url: "bluegrasshvac.test/services", urgency: "no_rush", asked_by: "Mark Tran", status: "received", owner_id: "t_theo", created_at: now - 25 * 60_000 }),
  R({ id: 7, client_id: "c_ridgeline", service: "web", type: "feature", title: "New team page", details: "Can we add a page with the crew photos?", urgency: "no_rush", asked_by: "Dana Whitfield", status: "done", owner_id: "t_theo", created_at: now - 30 * D, first_reply_at: now - 30 * D + 5 * H, done_at: now - 21 * D, updated_at: now - 21 * D }),
];

let mid = 0;
const M = (request_id, author_type, author_name, body, created_at, internal = 0) => ({ id: ++mid, request_id, author_type, author_name, body, internal, created_at });
const messages = [
  ...requests.map((r) => M(r.id, "client", r.asked_by, r.details, r.created_at)),
  M(1, "system", "Theo Kim", "Theo Kim moved this to In progress", now - 11 * D),
  M(1, "team", "Theo Kim", "Page draft is ready. Before it goes live, could you send 2–3 photos of storm repairs you've done? Real photos convert much better than stock.", now - 6 * D),
  M(1, "system", "Theo Kim", "Theo Kim moved this to Your turn", now - 6 * D),
  M(2, "team", "Marisol Reyes", "Thanks Chris, I've updated it on the profile. Google usually takes 1–3 days to show the change.", now - 2 * D + 3 * H),
  M(5, "team", "Theo Kim", "Love it. I'll design a post and send it over for a quick look.", now - 3 * D + 4 * H),
  M(5, "client", "Priya Shah", "Can we also mention we take walk-ins on Saturdays?", now - 20 * 60_000),
  M(6, "team", "Theo Kim", "Internal: double-check if the 10-year warranty also applies to repairs before publishing.", now - 10 * 60_000, 1),
  M(7, "team", "Theo Kim", "The team page is live. Thanks for the photos!", now - 21 * D),
];

const approvals = [
  { id: 1, client_id: "c_ridgeline", service: "social", title: "November social posts", note: "Holiday referral promo is on Nov 7. Check the $250 amount is right.", due: dateIn(2), status: "sent", owner_id: "t_marisol", sent_at: now - 4 * D, reviewed_by: null, reviewed_at: null },
  { id: 2, client_id: "c_bluegrass", service: "social", title: "November social posts", note: null, due: dateIn(-1), status: "reviewed", owner_id: "t_marisol", sent_at: now - 6 * D, reviewed_by: "Mark Tran", reviewed_at: now - 1 * D },
];
let iid = 0;
const I = (approval_id, position, caption, when_label, decision = "pending", comment = null) => ({ id: ++iid, approval_id, position, caption, when_label, image_key: null, decision, comment, previous_comment: null });
const approvalItems = [
  I(1, 1, "Hail season isn't over. Here's how to spot roof damage from the ground in 5 minutes.", "Mon, Nov 3 · Facebook + Instagram"),
  I(1, 2, "Meet the crew: 14 years on roofs and still the first one up the ladder.", "Wed, Nov 5 · LinkedIn"),
  I(1, 3, "Refer a neighbor this holiday season and get $250 off your next service.", "Fri, Nov 7 · Facebook + Instagram"),
  I(1, 4, "Before and after: the Elm St. full replacement, done in two days.", "Tue, Nov 11 · Facebook + Instagram"),
  I(2, 1, "Furnace making a weird noise? 3 sounds you shouldn't ignore.", "Mon, Nov 3 · Facebook", "approved"),
  I(2, 2, "Holiday promo: $50 off any furnace tune-up through Dec 15.", "Fri, Nov 7 · Facebook + Instagram", "changes", "Can we say 15% off instead of $50 off? Matches our flyer."),
  I(2, 3, "Change your filter, save on your bill. Here's how often.", "Wed, Nov 12 · Instagram", "approved"),
  I(2, 4, "Team spotlight: Danny has kept Lexington warm for 12 winters.", "Tue, Nov 18 · Facebook + LinkedIn", "changes", "Use Rick, not Danny. Danny left in October."),
];

const sql = [
  "DELETE FROM outbox; DELETE FROM approval_items; DELETE FROM approvals; DELETE FROM attachments; DELETE FROM messages; DELETE FROM requests; DELETE FROM sessions; DELETE FROM clients; DELETE FROM team;",
  insert("team", team),
  insert("clients", clients),
  insert("requests", requests),
  insert("messages", messages),
  insert("approvals", approvals),
  insert("approval_items", approvalItems),
].join("\n");

mkdirSync("seed", { recursive: true });
writeFileSync("seed/seed.sql", sql + "\n");
writeFileSync(
  "seed/dev-logins.txt",
  `Test logins for the LOCAL trial build only (regenerated on every npm run db:seed).\n\n${logins.join("\n")}\n`,
);
console.log(`Seed written: ${requests.length} requests, ${approvals.length} approvals. Logins in seed/dev-logins.txt`);
