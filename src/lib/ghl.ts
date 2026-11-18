// Client emails through GHL: the Hub fills 4 custom fields on the client's GHL contact, then adds
// the contact to one of 5 workflows, and GHL sends the email (so it shows in Conversations).
// Spec: "Client Hub · GHL email workflows" doc. Token: GHL_API_TOKEN secret, never in code.
import { and, asc, desc, eq, gt, inArray, sql } from "drizzle-orm";
import { getDb, getEnv } from "@/db";
import { clients, outbox } from "@/db/schema";

const API = "https://services.leadconnectorhq.com";

export const WORKFLOWS = {
  received: { id: "3dea4253-0055-4f7b-b5b4-37c9f7d29331", label: "Request received", rank: 1 },
  message: { id: "0201035b-bbd2-4046-9a6e-89545f560621", label: "New message", rank: 2 },
  status: { id: "dfe78282-8324-4da7-9f68-3d8458f5a3cb", label: "Status update", rank: 3 },
  review: { id: "dc7a45bb-048c-481b-955b-f617324f772a", label: "Ready to review", rank: 4 },
  need: { id: "1ce9788b-60bd-4afc-9708-3b266ecf8858", label: "We need something", rank: 5 },
} as const;
export type EmailKind = keyof typeof WORKFLOWS;

// Contact custom fields created 2026-11-18 ("Hub · …").
const FIELDS = {
  message: "9lRduHo73MxlrLO12lWc",
  link: "vyzuUTv1FEyyvxeRf9uF",
  status: "puT9qlCG9soVdD8hVkNe",
  title: "I1j8rcpIdyVqR8xzt2Jp",
};

// At most one email per request every 10 minutes; at least 2 minutes between emails to the same
// contact, so one email's fields can't be overwritten by the next before GHL sends it.
const THREAD_GAP_MS = 10 * 60_000;
const CONTACT_GAP_MS = 2 * 60_000;

export type EmailPayload = { kind: EmailKind; clientId: string; title: string; status: string; message: string; path: string };

export async function ghlConfig() {
  const env = (await getEnv()) as unknown as Record<string, string | undefined>;
  if (!env.GHL_API_TOKEN || !env.GHL_LOCATION_ID) return null;
  return {
    token: env.GHL_API_TOKEN,
    locationId: env.GHL_LOCATION_ID,
    hubUrl: (env.HUB_URL || "https://tifhub.webflow.io").replace(/\/$/, ""),
  };
}
type Cfg = NonNullable<Awaited<ReturnType<typeof ghlConfig>>>;

async function call<T>(cfg: Cfg, method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${cfg.token}`, Version: "2021-07-28", Accept: "application/json", "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`GHL ${method} ${path.split("?")[0]}: HTTP ${res.status} ${text.slice(0, 160)}`);
  return (text ? JSON.parse(text) : {}) as T;
}

/** Finds the GHL contact with exactly this email in our sub-account. Never creates one. */
export async function findContactByEmail(email: string) {
  const cfg = await ghlConfig();
  if (!cfg) throw new Error("GHL isn't connected");
  const q = new URLSearchParams({ locationId: cfg.locationId, email });
  const data = await call<{ contact?: { id: string; email?: string; firstName?: string; lastName?: string } | null }>(
    cfg, "GET", `/contacts/search/duplicate?${q}`,
  );
  const c = data.contact;
  if (!c || c.email?.toLowerCase() !== email.toLowerCase()) return null;
  return { id: c.id, name: [c.firstName, c.lastName].filter(Boolean).join(" ") };
}

/* ------------------------------------------------------------------ sending */

type Row = typeof outbox.$inferSelect;
const threadOf = (r: Row) => (r.requestId ? `r${r.requestId}` : r.approvalId ? `a${r.approvalId}` : `x${r.id}`);

/**
 * Sends client emails that are due. Several events on the same request inside the 10-minute window
 * become ONE email: the most important workflow wins (we need something > ready to review > status >
 * new message > received) and the messages are joined. Runs after each event and whenever someone
 * uses the Hub, since there's no scheduler.
 */
export async function flushGhl(manual = false) {
  const cfg = await ghlConfig();
  if (!cfg) return;
  const db = await getDb();
  const now = Date.now();
  const waiting = await db.query.outbox.findMany({
    where: and(eq(outbox.target, "ghl"), eq(outbox.kind, "email"), inArray(outbox.status, ["pending", "failed"])),
    orderBy: [asc(outbox.id)],
    limit: 100,
  });
  if (!waiting.length) return;
  const recentSent = await db.query.outbox.findMany({
    where: and(eq(outbox.target, "ghl"), eq(outbox.status, "sent"), gt(outbox.sentAt, now - THREAD_GAP_MS)),
    orderBy: [desc(outbox.sentAt)],
  });

  const groups = new Map<string, Row[]>();
  for (const r of waiting) {
    if (!manual && r.status === "failed" && r.attempts >= 5) continue; // stops retrying on its own; "Send again" still works
    groups.set(threadOf(r), [...(groups.get(threadOf(r)) ?? []), r]);
  }

  for (const rows of groups.values()) {
    const payloads = rows.map((r) => JSON.parse(r.payload) as EmailPayload);
    const client = await db.query.clients.findFirst({ where: eq(clients.id, payloads[0].clientId) });
    const ids = rows.map((r) => r.id);
    if (!client?.active || !client.emailsOn || !client.ghlContactId) {
      const why = !client?.active ? "Client is deactivated" : !client.ghlContactId ? "No GHL contact linked" : "Emails are off for this client";
      await db.update(outbox).set({ status: "skipped", error: why }).where(inArray(outbox.id, ids));
      continue;
    }
    // Stale: an update that couldn't go out within a day would only confuse the client now.
    const fresh = rows.filter((r) => now - r.createdAt < 86_400_000);
    if (!fresh.length) {
      await db.update(outbox).set({ status: "skipped", error: "Too old to send (over a day)" }).where(inArray(outbox.id, ids));
      continue;
    }
    const thread = threadOf(rows[0]);
    const lastThread = recentSent.find((s) => threadOf(s) === thread);
    const lastContact = recentSent.find((s) => (JSON.parse(s.payload) as EmailPayload).clientId === client.id);
    if (!manual && lastThread && now - (lastThread.sentAt ?? 0) < THREAD_GAP_MS) continue; // merge window still open
    if (lastContact && now - (lastContact.sentAt ?? 0) < CONTACT_GAP_MS) continue;

    // Claim every row in the group first, so two runs can't send the same email.
    const claimed = await db
      .update(outbox)
      .set({ status: "sending", claimedAt: now, attempts: sql`${outbox.attempts} + 1` })
      .where(and(inArray(outbox.id, ids), inArray(outbox.status, ["pending", "failed"])))
      .returning({ id: outbox.id });
    if (claimed.length !== ids.length) {
      await db.update(outbox).set({ status: "pending" }).where(and(inArray(outbox.id, claimed.map((c) => c.id)), eq(outbox.status, "sending")));
      continue;
    }

    const latest = payloads[payloads.length - 1];
    const top = payloads.reduce((a, b) => (WORKFLOWS[b.kind].rank >= WORKFLOWS[a.kind].rank ? b : a));
    const message = [...new Set(payloads.map((p) => p.message.trim()).filter(Boolean))].join("\n\n").slice(0, 5000);
    const primary = rows[payloads.indexOf(top)];
    try {
      await call(cfg, "PUT", `/contacts/${client.ghlContactId}`, {
        customFields: [
          { id: FIELDS.title, field_value: latest.title.slice(0, 200) },
          { id: FIELDS.status, field_value: latest.status },
          { id: FIELDS.message, field_value: message },
          { id: FIELDS.link, field_value: `${cfg.hubUrl}${top.path}` },
        ],
      });
      await call(cfg, "POST", `/contacts/${client.ghlContactId}/workflow/${WORKFLOWS[top.kind].id}`, {});
      const sentAt = Date.now();
      await db.update(outbox).set({ status: "sent", sentAt, error: null }).where(eq(outbox.id, primary.id));
      const others = ids.filter((id) => id !== primary.id);
      if (others.length) await db.update(outbox).set({ status: "sent", sentAt, error: `Merged into one email (${WORKFLOWS[top.kind].label})` }).where(inArray(outbox.id, others));
    } catch (e) {
      await db
        .update(outbox)
        .set({ status: "failed", error: String((e as Error).message ?? e).slice(0, 500) })
        .where(inArray(outbox.id, ids));
    }
  }
}
