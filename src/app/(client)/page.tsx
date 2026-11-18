import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { approvalItems, approvals, requests } from "@/db/schema";
import { requireClient } from "@/lib/auth";
import { serviceShort } from "@/lib/constants";
import { openRequests, teamMap } from "@/lib/queries";
import { clientLine, firstName } from "@/lib/sentences";
import { fmtDateInput, fmtDay, replyByLabel } from "@/lib/time";
import { initialsOf } from "@/components/ui";

export default async function Home() {
  const client = await requireClient();
  const db = await getDb();
  const [open, sentApprovals, done, people] = await Promise.all([
    openRequests(db, client.id),
    db.query.approvals.findMany({ where: and(eq(approvals.clientId, client.id), eq(approvals.status, "sent")) }),
    db.query.requests.findMany({
      where: and(eq(requests.clientId, client.id), eq(requests.status, "done")),
      orderBy: [desc(requests.doneAt)],
      limit: 3,
    }),
    teamMap(db),
  ]);
  const itemCounts = new Map<number, number>();
  for (const a of sentApprovals) {
    const items = await db.query.approvalItems.findMany({ where: eq(approvalItems.approvalId, a.id) });
    itemCounts.set(a.id, items.filter((i) => i.decision === "pending").length);
  }
  const yourTurn = open.filter((r) => r.status === "your_turn");
  const working = open.filter((r) => r.status !== "your_turn");
  const lead = client.leadId ? people.get(client.leadId) : undefined;
  const backup = client.backupId ? people.get(client.backupId) : undefined;
  const turnTotal = yourTurn.length + sentApprovals.length;

  return (
    <>
      <div className="hello">
        <div>
          <h1>Hi, {client.name}</h1>
          <p className="sub" style={{ margin: 0 }}>
            Here&apos;s where everything stands.
          </p>
        </div>
        <Link className="btn big" href="/new">
          + Ask us something
        </Link>
      </div>

      <div className="grid2">
        <div>
          <div className="section-h">
            <h2>Your turn {turnTotal ? `(${turnTotal})` : ""}</h2>
          </div>
          {turnTotal === 0 && <div className="empty">Nothing needs you right now.</div>}
          {sentApprovals.map((a) => (
            <div className="turn" key={`a${a.id}`}>
              <div>
                <b>Approve: {a.title}</b>
                <small>
                  {itemCounts.get(a.id)} item{itemCounts.get(a.id) === 1 ? "" : "s"} to review
                  {a.due ? ` · please reply by ${fmtDateInput(a.due)}` : ""}
                </small>
              </div>
              <Link className="btn sm" href={`/approvals/${a.id}`}>
                Review
              </Link>
            </div>
          ))}
          {yourTurn.map((r) => (
            <div className="turn" key={r.id}>
              <div>
                <b>{r.title}</b>
                <small>{r.needText}</small>
              </div>
              <Link className="btn sm" href={`/requests/${r.id}`}>
                {r.needAction || "Reply"}
              </Link>
            </div>
          ))}

          <div className="section-h">
            <h2>We&apos;re working on</h2>
            <Link href="/requests">See all →</Link>
          </div>
          {working.length === 0 && <div className="empty">No open requests. Need something? Tap “Ask us something”.</div>}
          {working.map((r) => (
            <Link className="req" key={r.id} href={`/requests/${r.id}`}>
              <span className="svc">{serviceShort(r.service)}</span>
              <div>
                <b>{r.title}</b>
                <small>
                  {clientLine({
                    ...r,
                    ownerName: r.ownerId ? people.get(r.ownerId)?.name : null,
                    replyByText: replyByLabel(r.replyBy).text,
                  })}
                </small>
              </div>
              <span className="arrow">›</span>
            </Link>
          ))}
        </div>

        <aside className="stack">
          <div className="card">
            <h2>Your team</h2>
            {lead && (
              <div className="person">
                <div className="av">{lead.initials}</div>
                <div>
                  {lead.name}
                  <small>Your main contact</small>
                </div>
              </div>
            )}
            {backup && (
              <div className="person">
                <div className="av">{initialsOf(backup.name)}</div>
                <div>
                  {backup.name}
                  <small>Backup</small>
                </div>
              </div>
            )}
            <p className="muted" style={{ margin: "6px 0 0" }}>
              We answer every request within 1 business day{lead ? `. ${firstName(lead.name)} gets yours first.` : "."}
            </p>
          </div>
          {done.length > 0 && (
            <div className="card">
              <h2>Recently done</h2>
              {done.map((r) => (
                <Link className="req" key={r.id} href={`/requests/${r.id}`} style={{ padding: "8px 0" }}>
                  <div>
                    <b style={{ fontSize: 14 }}>{r.title}</b>
                    <small>{r.doneAt ? fmtDay(r.doneAt) : ""}</small>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </aside>
      </div>
    </>
  );
}
