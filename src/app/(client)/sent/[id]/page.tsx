import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { requests } from "@/db/schema";
import { requireClient } from "@/lib/auth";
import { serviceLabel, URGENCY } from "@/lib/constants";
import { teamMap } from "@/lib/queries";
import { firstName } from "@/lib/sentences";
import { replyByLabel } from "@/lib/time";

export default async function Sent({ params }: { params: Promise<{ id: string }> }) {
  const client = await requireClient();
  const db = await getDb();
  const r = await db.query.requests.findFirst({
    where: and(eq(requests.id, Number((await params).id)), eq(requests.clientId, client.id)),
  });
  if (!r) notFound();
  const owner = r.ownerId ? (await teamMap(db)).get(r.ownerId) : undefined;
  const who = firstName(owner?.name) || "Your team";
  return (
    <div className="sent">
      <div className="bigcheck">✓</div>
      <h1>Got it, {firstName(r.askedBy)}.</h1>
      <p className="sub">
        Your request is with {who}. {owner ? "They'll" : "We'll"} reply by <b>{replyByLabel(r.replyBy).text.toLowerCase()}</b>.
      </p>
      <div className="card">
        <div className="muted mono" style={{ fontSize: 12 }}>
          REQ-{1000 + r.id} · {serviceLabel(r.service)} · {URGENCY[r.urgency as keyof typeof URGENCY]?.label}
        </div>
        <b>{r.title}</b>
        <p className="muted" style={{ margin: "6px 0 0" }}>
          We&apos;ll email {client.loginEmail} when there&apos;s news. You can also check back here any time.
        </p>
      </div>
      <div className="row" style={{ justifyContent: "center" }}>
        <Link className="btn" href={`/requests/${r.id}`}>
          View request
        </Link>
        <Link className="btn ghost" href="/new">
          Ask something else
        </Link>
      </div>
    </div>
  );
}
