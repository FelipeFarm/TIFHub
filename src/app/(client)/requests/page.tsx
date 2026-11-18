import Link from "next/link";
import { and, desc, eq, ne } from "drizzle-orm";
import { getDb } from "@/db";
import { approvals, requests } from "@/db/schema";
import { requireClient } from "@/lib/auth";
import { serviceShort } from "@/lib/constants";
import { teamMap } from "@/lib/queries";
import { clientLine } from "@/lib/sentences";
import { fmtDateInput, fmtDay, replyByLabel } from "@/lib/time";
import { StatusPill } from "@/components/ui";

export default async function MyRequests({ searchParams }: { searchParams: Promise<{ show?: string; q?: string }> }) {
  const client = await requireClient();
  const { show, q } = await searchParams;
  const showDone = show === "done";
  const db = await getDb();
  const [rows, appr, people] = await Promise.all([
    db.query.requests.findMany({
      where: and(eq(requests.clientId, client.id), showDone ? eq(requests.status, "done") : ne(requests.status, "done")),
      orderBy: [desc(requests.updatedAt)],
    }),
    showDone
      ? Promise.resolve([])
      : db.query.approvals.findMany({ where: and(eq(approvals.clientId, client.id), eq(approvals.status, "sent")) }),
    teamMap(db),
  ]);
  const term = (q ?? "").trim().toLowerCase();
  const list = rows
    .filter((r) => !term || `${r.title} ${r.details}`.toLowerCase().includes(term))
    .sort((a, b) => Number(b.status === "your_turn") - Number(a.status === "your_turn"));

  return (
    <>
      <div className="hello">
        <div>
          <h1>My requests</h1>
          <p className="sub" style={{ margin: 0 }}>
            Everything you&apos;ve asked us for.
          </p>
        </div>
        <Link className="btn" href="/new">
          + Ask us something
        </Link>
      </div>
      <div className="filters">
        <Link href="/requests" className={showDone ? "" : "on"}>
          Open
        </Link>
        <Link href="/requests?show=done" className={showDone ? "on" : ""}>
          Done
        </Link>
      </div>
      <form>
        {showDone && <input type="hidden" name="show" value="done" />}
        <input className="input" name="q" defaultValue={q} placeholder="Search requests…" style={{ marginBottom: 8 }} />
      </form>

      {appr.map((a) => (
        <Link className="req" key={`a${a.id}`} href={`/approvals/${a.id}`}>
          <span className="svc">{serviceShort(a.service)}</span>
          <div>
            <b>Approve: {a.title}</b>
            <small>Waiting on you{a.due ? ` · reply by ${fmtDateInput(a.due)}` : ""}</small>
          </div>
          <StatusPill status="your_turn" />
        </Link>
      ))}
      {list.map((r) => (
        <Link className="req" key={r.id} href={`/requests/${r.id}`}>
          <span className="svc">{serviceShort(r.service)}</span>
          <div>
            <b>{r.title}</b>
            <small>
              {showDone
                ? `Done ${r.doneAt ? fmtDay(r.doneAt) : ""} · asked by ${r.askedBy}`
                : clientLine({ ...r, ownerName: r.ownerId ? people.get(r.ownerId)?.name : null, replyByText: replyByLabel(r.replyBy).text })}
            </small>
          </div>
          <StatusPill status={r.status} />
        </Link>
      ))}
      {!list.length && !appr.length && (
        <div className="empty" style={{ marginTop: 12 }}>
          {term ? "Nothing matches that search." : showDone ? "Nothing finished yet." : "No open requests."}
        </div>
      )}
    </>
  );
}
