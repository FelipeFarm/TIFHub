import Link from "next/link";
import { and, eq, isNull, ne } from "drizzle-orm";
import { getDb } from "@/db";
import { approvals, offerEvents, requests, type Request } from "@/db/schema";
import { requireTeam } from "@/lib/auth";
import { serviceLabel, typeLabel, URGENCY } from "@/lib/constants";
import { teamMap } from "@/lib/queries";
import { duration, fmtDateInput, replyByLabel } from "@/lib/time";
import { assignOwner, markInterestHandled } from "@/app/actions";
import { SERVICE_NAMES, isOfferService } from "@/lib/offers";
import { AssignSelect } from "./AssignSelect";

export default async function Inbox({ searchParams }: { searchParams: Promise<{ who?: string; client?: string }> }) {
  const me = await requireTeam();
  const { who = "all", client: clientFilter } = await searchParams;
  const db = await getDb();
  const [allReqs, allAppr, people, clientRows, allInterest] = await Promise.all([
    db.query.requests.findMany({ where: ne(requests.status, "done") }),
    db.query.approvals.findMany({ where: ne(approvals.status, "closed") }),
    teamMap(db),
    db.query.clients.findMany(),
    db.query.offerEvents.findMany({ where: and(eq(offerEvents.action, "interested"), isNull(offerEvents.handledAt)) }),
  ]);
  const clientName = new Map(clientRows.map((c) => [c.id, c.name]));
  const keep = (clientId: string, ownerId: string | null) =>
    (!clientFilter || clientId === clientFilter) &&
    (who === "mine" ? ownerId === me.id : who === "unassigned" ? !ownerId : true);
  const reqs = allReqs.filter((r) => keep(r.clientId, r.ownerId));
  const interest = allInterest.filter((e) => keep(e.clientId, clientRows.find((c) => c.id === e.clientId)?.leadId ?? null));
  const appr = allAppr.filter((a) => keep(a.clientId, a.ownerId));
  const now = Date.now();

  const needsReply = reqs
    .filter((r) => !r.firstReplyAt)
    .sort((a, b) => Number(b.urgency === "urgent") - Number(a.urgency === "urgent") || a.replyBy - b.replyBy);
  const replied = reqs.filter((r) => r.firstReplyAt && r.clientRepliedAt).sort((a, b) => a.clientRepliedAt! - b.clientRepliedAt!);
  const reviewed = appr.filter((a) => a.status === "reviewed");
  const waiting = reqs.filter((r) => r.firstReplyAt && !r.clientRepliedAt && r.status === "your_turn");
  const waitingAppr = appr.filter((a) => a.status === "sent");
  const late = needsReply.filter((r) => r.replyBy < now).length;
  const team = [...people.values()].filter((t) => t.active);

  const askedCell = (r: Request) => (
    <td>
      <b>{clientName.get(r.clientId)}</b>
      <small>{r.askedBy}</small>
    </td>
  );
  const reqCell = (r: Request) => (
    <td>
      <Link className="rowlink" href={`/team/requests/${r.id}`}>
        {r.title}
      </Link>
      <small>
        {[serviceLabel(r.service), typeLabel(r.service, r.type), r.channel !== "hub" ? `via ${r.channel}` : null, `REQ-${1000 + r.id}`]
          .filter(Boolean)
          .join(" · ")}
      </small>
    </td>
  );
  const ownerCell = (r: Request) => (
    <td>{r.ownerId ? people.get(r.ownerId)?.name : <AssignSelect requestId={r.id} team={team.map((t) => ({ id: t.id, name: t.name }))} action={assignOwner} />}</td>
  );
  const filterHref = (w: string) => `/team?who=${w}${clientFilter ? `&client=${clientFilter}` : ""}`;

  return (
    <>
      <div className="hello">
        <div>
          <h1>Inbox</h1>
          <p className="sub" style={{ margin: 0 }}>
            Client requests from every account, most urgent first.
          </p>
        </div>
        <Link className="btn" href="/team/log">
          + Log a request
        </Link>
      </div>

      <div className="stats">
        <div className={`stat ${late ? "bad" : ""}`}>
          <b>{needsReply.length}</b>
          <span>Need a reply{late ? ` · ${late} overdue` : ""}</span>
        </div>
        <div className="stat warn">
          <b>{replied.length + reviewed.length}</b>
          <span>Client replied</span>
        </div>
        <div className="stat">
          <b>{waiting.length + waitingAppr.length}</b>
          <span>Waiting on client</span>
        </div>
      </div>

      <div className="filters">
        {[
          ["all", "Everyone"],
          ["mine", "Mine"],
          ["unassigned", "Unassigned"],
        ].map(([k, label]) => (
          <Link key={k} href={filterHref(k)} className={who === k ? "on" : ""}>
            {label}
          </Link>
        ))}
        {clientRows.map((c) => (
          <Link key={c.id} href={clientFilter === c.id ? `/team?who=${who}` : `/team?who=${who}&client=${c.id}`} className={clientFilter === c.id ? "on" : ""}>
            {c.name}
          </Link>
        ))}
      </div>

      <div className="tablewrap">
        <table>
          <thead>
            <tr>
              <th>Client</th>
              <th>Request</th>
              <th>How soon</th>
              <th>Owner</th>
              <th>Reply by</th>
            </tr>
          </thead>
          <tbody>
            <tr className="grp">
              <td colSpan={5}>
                Needs a reply <span>{needsReply.length}</span>
              </td>
            </tr>
            {needsReply.map((r) => {
              const rb = replyByLabel(r.replyBy, now);
              return (
                <tr key={r.id}>
                  {askedCell(r)}
                  {reqCell(r)}
                  <td>
                    <span className={`pill ${r.urgency === "urgent" ? "urg" : ""}`}>{URGENCY[r.urgency as keyof typeof URGENCY]?.label}</span>
                  </td>
                  {ownerCell(r)}
                  <td className={`sla ${rb.late ? "late" : ""}`}>{rb.text}</td>
                </tr>
              );
            })}
            {!needsReply.length && (
              <tr className="none">
                <td colSpan={5}>All caught up.</td>
              </tr>
            )}

            <tr className="grp">
              <td colSpan={5}>
                Client replied <span>{replied.length + reviewed.length}</span>
              </td>
            </tr>
            {replied.map((r) => (
              <tr key={r.id}>
                {askedCell(r)}
                {reqCell(r)}
                <td>—</td>
                {ownerCell(r)}
                <td className="sla">{duration(now - r.clientRepliedAt!)} ago</td>
              </tr>
            ))}
            {reviewed.map((a) => (
              <tr key={`a${a.id}`}>
                <td>
                  <b>{clientName.get(a.clientId)}</b>
                  <small>{a.reviewedBy}</small>
                </td>
                <td>
                  <Link className="rowlink" href="/team/approvals">
                    Reviewed: {a.title}
                  </Link>
                  <small>Approval</small>
                </td>
                <td>—</td>
                <td>{a.ownerId ? people.get(a.ownerId)?.name : "—"}</td>
                <td className="sla">{a.reviewedAt ? `${duration(now - a.reviewedAt)} ago` : ""}</td>
              </tr>
            ))}
            {!replied.length && !reviewed.length && (
              <tr className="none">
                <td colSpan={5}>Nothing new from clients.</td>
              </tr>
            )}

            {interest.length > 0 && (
              <>
                <tr className="grp">
                  <td colSpan={5}>
                    Interested in more <span>{interest.length}</span>
                  </td>
                </tr>
                {interest.map((e) => (
                  <tr key={`i${e.id}`}>
                    <td>
                      <b>{clientName.get(e.clientId)}</b>
                      <small>{e.askedBy ?? ""}</small>
                    </td>
                    <td>
                      Interested in <b>{isOfferService(e.service) ? SERVICE_NAMES[e.service] : e.service}</b>
                      <small>
                        {e.trigger === "after_request" ? "Clicked “Tell me more” after a request" : "From the Services card on their home"} ·{" "}
                        {fmtDateInput(new Date(e.at).toISOString().slice(0, 10))}
                      </small>
                    </td>
                    <td>
                      <span className="pill prog">Sales</span>
                    </td>
                    <td>{(() => { const c = clientRows.find((x) => x.id === e.clientId); return c?.leadId ? people.get(c.leadId)?.name : "—"; })()}</td>
                    <td>
                      <form action={markInterestHandled}>
                        <input type="hidden" name="id" value={e.id} />
                        <button className="btn sm ghost">Followed up</button>
                      </form>
                    </td>
                  </tr>
                ))}
              </>
            )}

            <tr className="grp">
              <td colSpan={5}>
                Waiting on client <span>{waiting.length + waitingAppr.length}</span>
              </td>
            </tr>
            {waiting.map((r) => (
              <tr key={r.id}>
                {askedCell(r)}
                {reqCell(r)}
                <td>—</td>
                {ownerCell(r)}
                <td className="sla">Waiting {duration(now - r.updatedAt)}</td>
              </tr>
            ))}
            {waitingAppr.map((a) => (
              <tr key={`a${a.id}`}>
                <td>
                  <b>{clientName.get(a.clientId)}</b>
                </td>
                <td>
                  <Link className="rowlink" href="/team/approvals">
                    Approve: {a.title}
                  </Link>
                  <small>Approval</small>
                </td>
                <td>—</td>
                <td>{a.ownerId ? people.get(a.ownerId)?.name : "—"}</td>
                <td className="sla">{a.due ? `Due ${fmtDateInput(a.due)}` : ""}</td>
              </tr>
            ))}
            {!waiting.length && !waitingAppr.length && (
              <tr className="none">
                <td colSpan={5}>Not waiting on anyone.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="muted" style={{ marginTop: 12 }}>
        Requests where we&apos;re just doing the work don&apos;t show here. They&apos;re on the monday Hub Requests board.
      </p>
    </>
  );
}
