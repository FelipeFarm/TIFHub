import { getDb } from "@/db";
import { outbox } from "@/db/schema";

/**
 * Queue something for GHL (client emails) or monday (items/updates).
 * Trial build: nothing is sent. Step 4 adds a worker that delivers these.
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
}
