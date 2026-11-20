import { getEnv } from "@/db";
import { pullItemFromMonday, mondayConfig, WATCHED_COLUMNS } from "@/lib/monday";
import { emailClient } from "@/lib/outbox";
import { sameSecret } from "@/lib/setup";
import { STATUS } from "@/lib/constants";

/**
 * monday → Hub. monday calls this when a column changes on the Hub Requests board.
 *
 * Safety:
 * - The address contains MONDAY_WEBHOOK_SECRET (24+ characters); anything else gets a plain 404.
 * - We never use the values monday sends. We only take the item id, then read that item from
 *   monday ourselves with our own token, and only if it's on the Hub Requests board and linked
 *   to a Hub request. So the worst a forged call could do is make the Hub re-read monday.
 * - Only Status, Owner, What's happening, We need and Due date are copied. Updates (comments)
 *   on monday stay internal and never reach the client.
 */
const notFound = () => new Response("Not found", { status: 404 });

export async function POST(req: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const env = (await getEnv()) as unknown as Record<string, string | undefined>;
  const secret = env.MONDAY_WEBHOOK_SECRET ?? process.env.MONDAY_WEBHOOK_SECRET ?? "";
  if (secret.length < 24 || !sameSecret(key, secret)) return notFound();

  const body = (await req.json().catch(() => null)) as {
    challenge?: string;
    event?: { boardId?: number | string; pulseId?: number | string; itemId?: number | string; columnId?: string; userId?: number | string };
  } | null;
  if (!body) return Response.json({ ok: false });

  // monday checks a new webhook by sending a challenge and expecting it back.
  if (typeof body.challenge === "string") return Response.json({ challenge: body.challenge.slice(0, 200) });

  const cfg = await mondayConfig();
  const ev = body.event;
  if (!cfg || !ev) return Response.json({ ok: true, skipped: "no event" });
  if (String(ev.boardId ?? "") !== cfg.boardId) return Response.json({ ok: true, skipped: "other board" });
  if (ev.columnId && !WATCHED_COLUMNS.has(ev.columnId)) return Response.json({ ok: true, skipped: "column not synced" });
  const itemId = String(ev.pulseId ?? ev.itemId ?? "");
  if (!/^\d{1,20}$/.test(itemId)) return Response.json({ ok: true, skipped: "no item" });
  const userId = /^\d{1,20}$/.test(String(ev.userId ?? "")) ? String(ev.userId) : null;

  try {
    const r = await pullItemFromMonday(itemId, userId);
    if (r.email && r.request) {
      await emailClient(
        { kind: r.email.kind, clientId: r.request.clientId, title: r.request.title, status: STATUS[r.request.status as keyof typeof STATUS], path: `/requests/${r.request.id}`, message: r.email.message },
        { requestId: r.request.id },
      );
    }
    return Response.json({ ok: true, changed: r.changed, reason: r.reason });
  } catch (e) {
    // 200 so monday doesn't keep retrying; the next change on the item syncs it anyway.
    console.error("monday webhook", (e as Error).message);
    return Response.json({ ok: false, error: "Couldn't read the item from monday" });
  }
}
