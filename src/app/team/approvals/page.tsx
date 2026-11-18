import { asc, desc, inArray, ne } from "drizzle-orm";
import { getDb } from "@/db";
import { approvalItems, approvals } from "@/db/schema";
import { requireTeam } from "@/lib/auth";
import { serviceShort } from "@/lib/constants";
import { fileUrl } from "@/lib/files";
import { fmtDateInput, fmtDay, todayInput } from "@/lib/time";
import { closeApproval, resendItem } from "@/app/actions";
import { ApprovalBuilder } from "./ApprovalBuilder";

export default async function TeamApprovals({ searchParams }: { searchParams: Promise<{ sent?: string }> }) {
  await requireTeam();
  const db = await getDb();
  const [list, clientRows] = await Promise.all([
    db.query.approvals.findMany({ where: ne(approvals.status, "closed"), orderBy: [desc(approvals.sentAt)] }),
    db.query.clients.findMany({ orderBy: (c, { asc }) => [asc(c.name)] }),
  ]);
  const items = list.length
    ? await db.query.approvalItems.findMany({
        where: inArray(approvalItems.approvalId, list.map((a) => a.id)),
        orderBy: [asc(approvalItems.position)],
      })
    : [];
  const clientName = new Map(clientRows.map((c) => [c.id, c.name]));
  const itemsOf = (id: number) => items.filter((i) => i.approvalId === id);
  const needsWork = list.filter((a) => itemsOf(a.id).some((i) => i.decision === "changes") || a.status === "reviewed");
  const waiting = list.filter((a) => a.status === "sent");

  return (
    <>
      <h1>Approvals</h1>
      <p className="sub">Send work to a client to approve, and see what came back.</p>
      {(await searchParams).sent && <div className="alert ok">Sent. It&apos;s now on the client&apos;s home screen under “Your turn”.</div>}

      <div className="grid2 wide">
        <div className="stack">
          {needsWork.length === 0 && <div className="empty">No reviews waiting for you.</div>}
          {needsWork.map((a) => {
            const its = itemsOf(a.id);
            const approved = its.filter((i) => i.decision === "approved").length;
            const changes = its.filter((i) => i.decision === "changes");
            return (
              <div className="card" key={a.id}>
                <div className="row between">
                  <h2 style={{ margin: 0 }}>
                    {clientName.get(a.clientId)} · {a.title}
                  </h2>
                  {a.status === "reviewed" ? (
                    <span className="pill prog">Reviewed by {a.reviewedBy}</span>
                  ) : (
                    <span className="pill you">Resent, waiting on client</span>
                  )}
                </div>
                <p className="muted" style={{ margin: "4px 0 12px" }}>
                  Sent {fmtDay(a.sentAt)}
                  {a.reviewedAt ? ` · reviewed ${fmtDay(a.reviewedAt)}` : ""}
                </p>
                <div className="progress" style={{ margin: "0 0 6px" }}>
                  <i style={{ width: `${its.length ? (approved / its.length) * 100 : 0}%` }} />
                </div>
                <p style={{ margin: "0 0 14px" }}>
                  <b>{approved} approved</b>
                  {changes.length > 0 && (
                    <>
                      {" "}· <b style={{ color: "var(--warn)" }}>{changes.length} need{changes.length === 1 ? "s" : ""} changes</b>
                    </>
                  )}
                </p>
                {changes.map((i) => (
                  <div className="chg-item" key={i.id}>
                    {i.imageKey && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={fileUrl(i.imageKey)} alt="" style={{ width: 64, height: 48, objectFit: "cover", borderRadius: 4 }} />
                    )}
                    <div>
                      <b>{i.whenLabel || `Item ${i.position}`}</b>
                      <p>“{i.comment}”</p>
                    </div>
                    <form action={resendItem}>
                      <input type="hidden" name="itemId" value={i.id} />
                      <input className="input" name="caption" defaultValue={i.caption} aria-label="Updated caption" />
                      <input type="file" name="file" accept="image/*,.pdf" aria-label="Replacement image" />
                      <button className="btn sm">Fix &amp; resend</button>
                    </form>
                  </div>
                ))}
                {changes.length === 0 && a.status === "reviewed" && (
                  <form action={closeApproval}>
                    <input type="hidden" name="approvalId" value={a.id} />
                    <button className="btn sm ghost">All approved, close it</button>
                  </form>
                )}
              </div>
            );
          })}

          <div className="card">
            <h2>Waiting on clients</h2>
            {waiting.length === 0 && <p className="muted">Nothing out for approval.</p>}
            {waiting.map((a) => {
              const its = itemsOf(a.id);
              const pending = its.filter((i) => i.decision === "pending").length;
              return (
                <div className="req" key={a.id}>
                  <span className="svc">{serviceShort(a.service)}</span>
                  <div>
                    <b>
                      {clientName.get(a.clientId)} · {a.title}
                    </b>
                    <small>
                      Sent {fmtDay(a.sentAt)} · {pending} of {its.length} waiting
                      {a.due ? ` · due ${fmtDateInput(a.due)}` : ""}
                    </small>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <aside>
          <ApprovalBuilder clients={clientRows.map((c) => ({ id: c.id, name: c.name }))} defaultDue={todayInput(4)} />
        </aside>
      </div>
    </>
  );
}
