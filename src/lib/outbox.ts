import { getCloudflareContext } from "@opennextjs/cloudflare";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { outbox } from "@/db/schema";
import { deliverMonday, mondayConfig } from "./monday";

/**
 * Queue something for GHL (client emails) or monday (items/updates), then try to send it.
 * monday is connected (step 4a). GHL events stay "pending" until step 4b.
 * Sending never blocks or breaks what the person was doing: failures stay in the
 * Outbox with the reason, and the team can send them again from there.
 */
export async function queue(
  target: "ghl" | "monday",
  kind: string,
  summary: string,
  payload: Record<string, unknown>,
  link: { requestId?: number; approvalId?: number } = {},
) {
  const db = await getDb();
  await db.insert(outbox).values({
    target,
    kind,
    summary,
    payload: JSON.stringify(payload),
    createdAt: Date.now(),
    ...link,
  });
  if (target === "monday") await sendLater(() => flushMonday(link.requestId ?? null));
}

/** Runs after the response is sent when the runtime allows it, so the page doesn't wait on monday. */
async function sendLater(job: () => Promise<unknown>) {
  const run = () => job().catch((e) => console.error("[outbox]", e));
  try {
    const { ctx } = await getCloudflareContext({ async: true });
    if (ctx?.waitUntil) return ctx.waitUntil(run());
  } catch {}
  await run();
}

/**
 * Sends unsent monday events for one request, oldest first. Order matters (the item has to
 * exist before updates can be added), so the first failure stops the rest. Failed events are
 * retried with the next event for that request, or when the team clicks "Send again".
 */
export async function flushMonday(requestId: number | null) {
  const cfg = await mondayConfig();
  if (!cfg) return; // not configured: events wait in the Outbox
  const db = await getDb();
  const STUCK_MS = 2 * 60 * 1000;
  const rows = await db.query.outbox.findMany({
    where: and(
      eq(outbox.target, "monday"),
      inArray(outbox.status, ["pending", "failed", "sending"]),
      requestId === null ? sql`${outbox.requestId} IS NULL` : eq(outbox.requestId, requestId),
    ),
    orderBy: [asc(outbox.id)],
  });
  for (const row of rows) {
    // An earlier event is still on its way: let it finish first (that run sends the rest).
    if (row.status === "sending" && Date.now() - (row.claimedAt ?? 0) < STUCK_MS) return;
    // Claim the row so two requests at once can't send the same event twice.
    const claimed = await db
      .update(outbox)
      .set({ status: "sending", attempts: row.attempts + 1, claimedAt: Date.now() })
      .where(and(eq(outbox.id, row.id), eq(outbox.status, row.status)))
      .returning({ id: outbox.id });
    if (!claimed.length) continue;
    try {
      const note = await deliverMonday(cfg, row.kind, JSON.parse(row.payload), row.requestId);
      await db
        .update(outbox)
        .set(note === null ? { status: "skipped", error: "Not sent to monday (approvals stay in the Hub)" } : { status: "sent", sentAt: Date.now(), error: null })
        .where(eq(outbox.id, row.id));
    } catch (e) {
      await db.update(outbox).set({ status: "failed", error: String((e as Error).message ?? e).slice(0, 500) }).where(eq(outbox.id, row.id));
      break;
    }
  }
}
