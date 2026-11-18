"use server";

import { redirect } from "next/navigation";
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { approvalItems, approvals, clients, messages, offerEvents, outbox, requests, team } from "@/db/schema";
import {
  audit, burnTime, clearFailures, createSession, destroySession, isLockedOut, recordFailure, rememberName, rememberedName, requireClient,
  requireTeam, verifyPassword,
} from "@/lib/auth";
import { CHANNELS, NEED_ACTIONS, SERVICES, STATUS, URGENCY, type ServiceKey } from "@/lib/constants";
import { checkFiles, filesFrom, saveFiles } from "@/lib/files";
import { emailClient, flushGhlNow, flushMonday, flushSlack, queue } from "@/lib/outbox";
import { interestAlert, requestAlert, reviewAlert } from "@/lib/slack";
import { SERVICE_NAMES, availableOffers, isOfferService, offersLive } from "@/lib/offers";
import { fmtDateInput, replyByFor, replyByLabel } from "@/lib/time";

export type FormState = { error?: string } | undefined;

const str = (fd: FormData, k: string, max = 5000) => String(fd.get(k) ?? "").trim().slice(0, max);
const oneOf = <T extends string>(v: string, allowed: readonly T[], fallback: T): T =>
  (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
const titleFrom = (text: string) => {
  const first = text.split(/\n|(?<=[.!?])\s/)[0].trim();
  return first.length > 80 ? `${first.slice(0, 77).trimEnd()}…` : first;
};

/** First name of a team member, for client emails ("Marisol will reply by…"). */
async function firstNameOf(id: string | null) {
  if (!id) return "";
  const db = await getDb();
  const t = await db.query.team.findFirst({ where: eq(team.id, id) });
  return t?.name.split(" ")[0] ?? "";
}
const replyByText = (ms: number) => replyByLabel(ms).text.replace(/^(Today|Tomorrow)/, (w) => w.toLowerCase());

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
  await emailClient({
    kind: "received", clientId: client.id, title: req.title, status: STATUS.received, path: `/requests/${req.id}`,
    message: `${(await firstNameOf(req.ownerId)) || "Your team"} will reply by ${replyByText(req.replyBy)}.`,
  }, { requestId: req.id });
  await queue("slack", "alert", `Slack: new request from ${client.name}`, { text: await requestAlert("new", req) }, { requestId: req.id });
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
  await queue("slack", "alert", `Slack: ${client.name} replied on "${req.title}"`, { text: await requestAlert("reply", req, name) }, { requestId: id });
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
  const approvedTotal = items.filter((i) => i.decision === "approved").length + pending.length - changes;
  await queue("slack", "alert", `Slack: ${client.name} reviewed "${appr.title}"`, { text: await reviewAlert(appr, name, approvedTotal, changes) }, { approvalId: id });
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
    await emailClient({
      kind: "message", clientId: req.clientId, title: req.title, status: STATUS[req.status as keyof typeof STATUS] ?? "", path: `/requests/${id}`,
      message: `${me.name.split(" ")[0]} wrote: ${body || "We sent you files."}`,
    }, { requestId: id });
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
    const statusLine = str(fd, "statusLine", 160);
    const expected = str(fd, "expected", 10);
    const message =
      status === "your_turn" ? (needText ?? "")
      : status === "done" ? "All done. Something not right? Reply in the Hub and we'll reopen it."
      : [statusLine, expected ? `Expected ${fmtDateInput(expected)}.` : ""].filter(Boolean).join(" ") || "We're on it.";
    await emailClient({
      kind: status === "your_turn" ? "need" : "status", clientId: req.clientId, title: req.title, status: STATUS[status], path: `/requests/${id}`, message,
    }, { requestId: id });
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
    await emailClient({
      kind: "received", clientId: client.id, title: req.title, status: STATUS.received, path: `/requests/${req.id}`,
      message: `We've added your request from ${CHANNELS[channel].toLowerCase()} to your Client Hub, so you can follow it there. ${(await firstNameOf(ownerId)) || "Your team"} will reply by ${replyByText(req.replyBy)}.`,
    }, { requestId: req.id });
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
  await emailClient({
    kind: "review", clientId: client.id, title, status: "Ready to review", path: `/approvals/${appr.id}`,
    message: [appr.note ?? "", appr.due ? `Please approve or ask for changes by ${fmtDateInput(appr.due)}.` : ""].filter(Boolean).join(" "),
  }, { approvalId: appr.id });
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
  await emailClient({
    kind: "review", clientId: appr.clientId, title: appr.title, status: "Ready to review", path: `/approvals/${appr.id}`,
    message: "We updated what you asked us to change. Take a look and approve it, or tell us what else to change.",
  }, { approvalId: appr.id });
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
  if (!only) {
    await flushSlack(true);
    await flushGhlNow();
  }
  redirect("/team/outbox?retried=1");
}

/* ---------------------------------------------------------------- offers */

/** Client clicked "I'm interested" on an offer. Only services actually on offer to them are accepted. */
export async function clientInterested(fd: FormData) {
  const client = await requireClient();
  const service = str(fd, "service", 20);
  const trigger = str(fd, "trigger", 20) === "after_request" ? "after_request" : "home";
  const requestId = Number(fd.get("requestId")) || null;
  if (!isOfferService(service) || !(await offersVisible(client)) || !(await availableOffers(client)).includes(service)) redirect("/");
  const db = await getDb();
  const askedBy = (await rememberedName()) || null;
  let fromRequest: string | null = null;
  if (requestId) {
    const r = await db.query.requests.findFirst({ where: and(eq(requests.id, requestId), eq(requests.clientId, client.id)) });
    fromRequest = r?.title ?? null;
  }
  await db.insert(offerEvents).values({ clientId: client.id, service, action: "interested", trigger, requestId: fromRequest ? requestId : null, askedBy, at: Date.now() });
  await queue("slack", "alert", `Slack: ${client.name} is interested in ${SERVICE_NAMES[service]}`, {
    text: await interestAlert(client, SERVICE_NAMES[service], askedBy, fromRequest),
  });
  if (client.ghlContactId) {
    await queue("ghl", "tag", `GHL: tag ${client.name} "hub-interest-${service}"`, { contactId: client.ghlContactId, tag: `hub-interest-${service}` });
  }
  redirect(`/interested?service=${service}`);
}

/** Client clicked "Not now" / "No thanks": hide that offer for 90 days. */
export async function dismissOffer(fd: FormData) {
  const client = await requireClient();
  const service = str(fd, "service", 20);
  const back = str(fd, "back", 100);
  if (isOfferService(service)) {
    const db = await getDb();
    await db.insert(offerEvents).values({
      clientId: client.id, service, action: "dismissed", trigger: str(fd, "trigger", 20) || "home",
      requestId: Number(fd.get("requestId")) || null, askedBy: (await rememberedName()) || null, at: Date.now(),
    });
  }
  redirect(/^\/[a-z0-9/]*$/i.test(back) ? back : "/");
}

/** Team: mark a client's interest as followed up, so it leaves the inbox. */
export async function markInterestHandled(fd: FormData) {
  const me = await requireTeam();
  const id = Number(fd.get("id"));
  const db = await getDb();
  await db.update(offerEvents).set({ handledAt: Date.now(), handledBy: me.name }).where(eq(offerEvents.id, id));
  redirect("/team");
}

/** Offers show when the Hub-wide switch is on, or always to an admin previewing (never to other clients). */
async function offersVisible(client: { offersOn: boolean }) {
  return client.offersOn && (await offersLive());
}
