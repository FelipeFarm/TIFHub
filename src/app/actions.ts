"use server";

import { redirect } from "next/navigation";
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { approvalItems, approvals, clients, messages, outbox, requests, team } from "@/db/schema";
import {
  audit, burnTime, clearFailures, createSession, destroySession, isLockedOut, recordFailure, rememberName, requireClient,
  requireTeam, verifyPassword,
} from "@/lib/auth";
import { CHANNELS, NEED_ACTIONS, SERVICES, STATUS, URGENCY, type ServiceKey } from "@/lib/constants";
import { checkFiles, filesFrom, saveFiles } from "@/lib/files";
import { flushMonday, queue } from "@/lib/outbox";
import { replyByFor } from "@/lib/time";

export type FormState = { error?: string } | undefined;

const str = (fd: FormData, k: string, max = 5000) => String(fd.get(k) ?? "").trim().slice(0, max);
const oneOf = <T extends string>(v: string, allowed: readonly T[], fallback: T): T =>
  (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
const titleFrom = (text: string) => {
  const first = text.split(/\n|(?<=[.!?])\s/)[0].trim();
  return first.length > 80 ? `${first.slice(0, 77).trimEnd()}…` : first;
};

/** Only an active team member can own a request; anything else is ignored. */
async function activeOwner(id: string) {
  if (!id) return null;
  const db = await getDb();
  const t = await db.query.team.findFirst({ where: and(eq(team.id, id), eq(team.active, true)) });
  return t?.id ?? null;
}

/* ------------------------------------------------------------------ auth */

export async function login(_: FormState, fd: FormData): Promise<FormState> {
  const email = str(fd, "email", 200).toLowerCase();
  const password = String(fd.get("password") ?? "").slice(0, 200);
  const remember = fd.get("remember") === "on";
  // Same message whether the account exists or not, so the form can't be used to find valid emails.
  const wrong = { error: "That email and password don't match. Try again, or ask your Idea Farm contact for a new sign-in link." };
  if (!email || !password) return wrong;
  if (await isLockedOut(email)) {
    await burnTime(password);
    return { error: "Too many tries. Wait 15 minutes, or ask your Idea Farm contact for a new sign-in link." };
  }
  const db = await getDb();
  const member = await db.query.team.findFirst({ where: and(eq(team.email, email), eq(team.active, true)) });
  const client = member ? null : await db.query.clients.findFirst({ where: and(eq(clients.loginEmail, email), eq(clients.active, true)) });
  const account = member ?? client;
  const ok = account ? await verifyPassword(password, account.passwordHash) : (await burnTime(password), false);
  if (!ok || !account) {
    await recordFailure(email);
    return wrong;
  }
  await clearFailures(email);
  await createSession(member ? "team" : "client", account.id, remember);
  await audit(account.name, "signed in", member ? "team" : "client");
  redirect(member ? "/team" : "/");
}

export async function logout() {
  await destroySession();
  redirect("/login");
}

/* ---------------------------------------------------------------- client */

export async function createRequest(_: FormState, fd: FormData): Promise<FormState> {
  const client = await requireClient();
  const service = oneOf(str(fd, "service"), Object.keys(SERVICES) as ServiceKey[], "other");
  const typeKeys = SERVICES[service].types.map((t) => t[0]);
  const type = typeKeys.length ? oneOf(str(fd, "type"), typeKeys, typeKeys[0]) : null;
  const details = str(fd, "details");
  const askedBy = str(fd, "askedBy", 80);
  const urgency = oneOf(str(fd, "urgency"), Object.keys(URGENCY) as (keyof typeof URGENCY)[], "no_rush");
  const pageUrl = service === "web" ? str(fd, "pageUrl", 500) || null : null;
  const files = filesFrom(fd);

  if (!details) return { error: "Tell us a little about what you need." };
  if (!askedBy) return { error: "Please add your name so we know who to follow up with." };
  const fileError = checkFiles(files);
  if (fileError) return { error: fileError };

  const db = await getDb();
  const now = Date.now();
  const [req] = await db
    .insert(requests)
    .values({
      clientId: client.id, service, type, title: titleFrom(details), details, pageUrl, urgency, askedBy,
      ownerId: client.leadId, replyBy: replyByFor(urgency, now), createdAt: now, updatedAt: now,
    })
    .returning();
  const [msg] = await db
    .insert(messages)
    .values({ requestId: req.id, authorType: "client", authorName: askedBy, body: details, createdAt: now })
    .returning();
  await saveFiles(files, { clientId: client.id, requestId: req.id, messageId: msg.id });
  await rememberName(askedBy);
  await queue("monday", "create_item", `Create item "${req.title}" for ${client.name}`, { request: req, files: files.length }, { requestId: req.id });
  await queue("ghl", "email_client", `Confirmation email to ${client.name}: "We got your request"`, { to: client.loginEmail, askedBy }, { requestId: req.id });
  redirect(`/sent/${req.id}`);
}

export async function clientReply(_: FormState, fd: FormData): Promise<FormState> {
  const client = await requireClient();
  const id = Number(fd.get("requestId"));
  const body = str(fd, "body");
  const name = str(fd, "name", 80);
  const files = filesFrom(fd);
  if (!body && !files.length) return { error: "Write a message or attach a file." };
  if (!name) return { error: "Please add your name." };
  const fileError = checkFiles(files);
  if (fileError) return { error: fileError };

  const db = await getDb();
  const req = await db.query.requests.findFirst({ where: and(eq(requests.id, id), eq(requests.clientId, client.id)) });
  if (!req) return { error: "We couldn't find that request." };
  const now = Date.now();
  const [msg] = await db
    .insert(messages)
    .values({ requestId: id, authorType: "client", authorName: name, body: body || `Sent ${files.length} file${files.length > 1 ? "s" : ""}`, createdAt: now })
    .returning();
  await saveFiles(files, { clientId: client.id, requestId: id, messageId: msg.id });
  await db.update(requests).set({ clientRepliedAt: now, updatedAt: now }).where(eq(requests.id, id));
  await rememberName(name);
  await queue("monday", "add_update", `Add client reply to monday item for "${req.title}"`, { requestId: id, name, body }, { requestId: id });
  redirect(`/requests/${id}`);
}

export async function submitReview(_: FormState, fd: FormData): Promise<FormState> {
  const client = await requireClient();
  const id = Number(fd.get("approvalId"));
  const name = str(fd, "name", 80);
  if (!name) return { error: "Please add your name." };
  const db = await getDb();
  const appr = await db.query.approvals.findFirst({ where: and(eq(approvals.id, id), eq(approvals.clientId, client.id)) });
  if (!appr || appr.status !== "sent") return { error: "This approval was already sent back." };
  const items = await db.query.approvalItems.findMany({ where: eq(approvalItems.approvalId, id) });
  const pending = items.filter((i) => i.decision === "pending");
  for (const item of pending) {
    const decision = str(fd, `d_${item.id}`);
    const comment = str(fd, `c_${item.id}`, 2000);
    if (decision !== "approved" && decision !== "changes") return { error: "Please review every item before sending." };
    if (decision === "changes" && !comment) return { error: "Tell us what to change on each item you marked." };
  }
  for (const item of pending) {
    const decision = str(fd, `d_${item.id}`);
    await db
      .update(approvalItems)
      .set({ decision, comment: decision === "changes" ? str(fd, `c_${item.id}`, 2000) : null })
      .where(eq(approvalItems.id, item.id));
  }
  const now = Date.now();
  await db.update(approvals).set({ status: "reviewed", reviewedBy: name, reviewedAt: now }).where(eq(approvals.id, id));
  await rememberName(name);
  const changes = pending.filter((i) => str(fd, `d_${i.id}`) === "changes").length;
  await queue("monday", "add_update", `Approval "${appr.title}" reviewed by ${name}: ${pending.length - changes} approved, ${changes} changes`, { approvalId: id }, { approvalId: id });
  redirect(`/approvals/${id}?done=1`);
}

/* ------------------------------------------------------------------ team */

export async function teamReply(_: FormState, fd: FormData): Promise<FormState> {
  const me = await requireTeam();
  const id = Number(fd.get("requestId"));
  const body = str(fd, "body");
  const internal = fd.get("internal") === "1";
  const files = filesFrom(fd);
  if (!body && !files.length) return { error: "Write something first." };
  const fileError = checkFiles(files);
  if (fileError) return { error: fileError };

  const db = await getDb();
  const req = await db.query.requests.findFirst({ where: eq(requests.id, id) });
  if (!req) return { error: "Request not found." };
  const now = Date.now();
  const [msg] = await db
    .insert(messages)
    .values({ requestId: id, authorType: "team", authorName: me.name, body: body || "Sent files", internal, createdAt: now })
    .returning();
  await saveFiles(files, { clientId: req.clientId, requestId: id, messageId: msg.id });
  if (!internal) {
    await db
      .update(requests)
      .set({ firstReplyAt: req.firstReplyAt ?? now, clientRepliedAt: null, updatedAt: now })
      .where(eq(requests.id, id));
    await queue("ghl", "email_client", `Email client: new message from ${me.name} on "${req.title}"`, { requestId: id, from: me.name, body }, { requestId: id });
  }
  await queue("monday", "add_update", `${internal ? "Internal note" : "Reply"} on monday item for "${req.title}"`, { requestId: id, internal, body, team: true, from: me.name }, { requestId: id });
  redirect(`/team/requests/${id}`);
}

export async function updateRequest(_: FormState, fd: FormData): Promise<FormState> {
  const me = await requireTeam();
  const id = Number(fd.get("requestId"));
  const db = await getDb();
  const req = await db.query.requests.findFirst({ where: eq(requests.id, id) });
  if (!req) return { error: "Request not found." };

  const status = oneOf(str(fd, "status"), Object.keys(STATUS) as (keyof typeof STATUS)[], "in_progress");
  const needText = str(fd, "needText", 300) || null;
  if (status === "your_turn" && !needText) return { error: "Say what you need from the client." };
  const ownerId = await activeOwner(str(fd, "ownerId", 40));
  const notify = fd.get("notify") === "on";
  const now = Date.now();

  await db
    .update(requests)
    .set({
      status,
      statusLine: str(fd, "statusLine", 160) || null,
      expected: str(fd, "expected", 10) || null,
      needText,
      needAction: oneOf(str(fd, "needAction"), NEED_ACTIONS, "Reply"),
      ownerId,
      firstReplyAt: req.firstReplyAt ?? (notify ? now : null),
      clientRepliedAt: null,
      doneAt: status === "done" ? now : null,
      updatedAt: now,
    })
    .where(eq(requests.id, id));

  if (status !== req.status) {
    await db.insert(messages).values({
      requestId: id, authorType: "system", authorName: me.name, body: `${me.name} moved this to ${STATUS[status]}`, createdAt: now,
    });
  }
  // One event carries the whole update (status, what's happening, expected date, owner).
  await queue("monday", "update_item", `Update monday item for "${req.title}" (${STATUS[status]})`, { requestId: id, status, ownerId }, { requestId: id });
  if (notify) {
    await queue("ghl", "email_client", `Email client: "${req.title}" is now ${STATUS[status]}`, { requestId: id, status }, { requestId: id });
  }
  redirect(`/team/requests/${id}?saved=1`);
}

export async function assignOwner(fd: FormData) {
  await requireTeam();
  const id = Number(fd.get("requestId"));
  const ownerId = await activeOwner(str(fd, "ownerId", 40));
  const db = await getDb();
  await db.update(requests).set({ ownerId, updatedAt: Date.now() }).where(eq(requests.id, id));
  await queue("monday", "set_owner", `Set monday owner for request ${id}`, { requestId: id, ownerId }, { requestId: id });
  redirect("/team");
}

export async function logRequest(_: FormState, fd: FormData): Promise<FormState> {
  const me = await requireTeam();
  const db = await getDb();
  const client = await db.query.clients.findFirst({ where: and(eq(clients.id, str(fd, "clientId", 40)), eq(clients.active, true)) });
  if (!client) return { error: "Pick a client." };
  const service = oneOf(str(fd, "service"), Object.keys(SERVICES) as ServiceKey[], "other");
  const urgency = oneOf(str(fd, "urgency"), Object.keys(URGENCY) as (keyof typeof URGENCY)[], "no_rush");
  const channel = oneOf(str(fd, "channel"), Object.keys(CHANNELS) as (keyof typeof CHANNELS)[], "email");
  const details = str(fd, "details");
  const askedBy = str(fd, "askedBy", 80);
  if (!details) return { error: "Paste or summarize what they asked." };
  if (!askedBy) return { error: "Who asked?" };
  const ownerId = (await activeOwner(str(fd, "ownerId", 40))) ?? (await activeOwner(client.leadId ?? ""));
  const now = Date.now();
  const [req] = await db
    .insert(requests)
    .values({
      clientId: client.id, service, type: null, title: str(fd, "title", 120) || titleFrom(details), details, urgency, askedBy,
      channel, ownerId, replyBy: replyByFor(urgency, now), createdAt: now, updatedAt: now,
    })
    .returning();
  await db.insert(messages).values([
    { requestId: req.id, authorType: "client", authorName: askedBy, body: details, createdAt: now },
    { requestId: req.id, authorType: "system", authorName: me.name, body: `${me.name} added this from ${CHANNELS[channel].toLowerCase()}`, createdAt: now },
  ]);
  await queue("monday", "create_item", `Create item "${req.title}" for ${client.name}`, { request: req }, { requestId: req.id });
  if (fd.get("notify") === "on") {
    await queue("ghl", "email_client", `Email ${client.name}: "We've added this to your Client Hub"`, { requestId: req.id, askedBy }, { requestId: req.id });
  }
  redirect(`/team/requests/${req.id}`);
}

export async function sendApproval(_: FormState, fd: FormData): Promise<FormState> {
  const me = await requireTeam();
  const db = await getDb();
  const client = await db.query.clients.findFirst({ where: and(eq(clients.id, str(fd, "clientId", 40)), eq(clients.active, true)) });
  if (!client) return { error: "Pick a client." };
  const title = str(fd, "title", 120);
  if (!title) return { error: "Give it a name, like “December social posts”." };
  const count = Math.min(Number(fd.get("count")) || 0, 40);
  const items: { caption: string; when: string; file: File | null }[] = [];
  for (let i = 0; i < count; i++) {
    const caption = str(fd, `caption_${i}`, 2000);
    const f = fd.get(`file_${i}`);
    const file = f instanceof File && f.size > 0 ? f : null;
    if (caption || file) items.push({ caption, when: str(fd, `when_${i}`, 80), file });
  }
  if (!items.length) return { error: "Add at least one item for them to approve." };
  const fileError = checkFiles(items.flatMap((i) => (i.file ? [i.file] : [])));
  if (fileError) return { error: fileError };

  const now = Date.now();
  const [appr] = await db
    .insert(approvals)
    .values({
      clientId: client.id, service: oneOf(str(fd, "service"), ["social", "seo", "ads", "web"], "social"), title,
      note: str(fd, "note", 2000) || null, due: str(fd, "due", 10) || null, ownerId: me.id, sentAt: now,
    })
    .returning();
  for (const [pos, it] of items.entries()) {
    const [saved] = it.file ? await saveFiles([it.file], { clientId: client.id, approvalId: appr.id }) : [];
    await db.insert(approvalItems).values({
      approvalId: appr.id, position: pos + 1, caption: it.caption || it.file?.name || `Item ${pos + 1}`,
      whenLabel: it.when || null, imageKey: saved?.key ?? null,
    });
  }
  await queue("ghl", "email_client", `Email ${client.name}: "${title}" is ready to approve`, { approvalId: appr.id }, { approvalId: appr.id });
  redirect("/team/approvals?sent=1");
}

export async function resendItem(fd: FormData) {
  await requireTeam();
  const id = Number(fd.get("itemId"));
  const db = await getDb();
  const item = await db.query.approvalItems.findFirst({ where: eq(approvalItems.id, id) });
  if (!item) redirect("/team/approvals");
  const appr = await db.query.approvals.findFirst({ where: eq(approvals.id, item.approvalId) });
  if (!appr) redirect("/team/approvals");
  const f = fd.get("file");
  const file = f instanceof File && f.size > 0 ? f : null;
  const fileError = file ? checkFiles([file]) : null;
  if (fileError) redirect("/team/approvals");
  const [saved] = file ? await saveFiles([file], { clientId: appr.clientId, approvalId: appr.id }) : [];
  await db
    .update(approvalItems)
    .set({
      caption: str(fd, "caption", 2000) || item.caption,
      imageKey: saved?.key ?? item.imageKey,
      decision: "pending",
      previousComment: item.comment,
      comment: null,
    })
    .where(eq(approvalItems.id, id));
  await db.update(approvals).set({ status: "sent" }).where(eq(approvals.id, appr.id));
  await queue("ghl", "email_client", `Email client: updated item in "${appr.title}" ready to approve`, { approvalId: appr.id, itemId: id }, { approvalId: appr.id });
  redirect("/team/approvals");
}

export async function closeApproval(fd: FormData) {
  await requireTeam();
  const db = await getDb();
  await db.update(approvals).set({ status: "closed" }).where(eq(approvals.id, Number(fd.get("approvalId"))));
  redirect("/team/approvals");
}

/** Outbox: try failed or waiting monday events again, oldest first, one request at a time. */
export async function retryOutbox(fd: FormData) {
  await requireTeam();
  const db = await getDb();
  const only = Number(fd.get("requestId")) || null;
  const rows = await db.query.outbox.findMany({
    where: and(eq(outbox.target, "monday"), inArray(outbox.status, ["pending", "failed", "sending"])),
  });
  const ids = [...new Set(rows.map((r) => r.requestId))].filter((id) => only === null || id === only);
  for (const id of ids) await flushMonday(id);
  redirect("/team/outbox?retried=1");
}
