import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { attachments, clients, messages, outbox, requests } from "@/db/schema";
import { requireTeam } from "@/lib/auth";
import { CHANNELS, serviceLabel, typeLabel, URGENCY } from "@/lib/constants";
import { teamMap } from "@/lib/queries";
import { ago, replyByLabel } from "@/lib/time";
import { Files, initialsOf, Thread } from "@/components/ui";
import { TeamReply } from "./TeamReply";
import { mondayConfig } from "@/lib/monday";
import { ghlConfig } from "@/lib/ghl";
import { UpdateCard } from "./UpdateCard";

export default async function TeamRequest({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  await requireTeam();
  const id = Number((await params).id);
  const db = await getDb();
  const r = await db.query.requests.findFirst({ where: eq(requests.id, id) });
  if (!r) notFound();
  const [client, msgs, files, people, queued] = await Promise.all([
    db.query.clients.findFirst({ where: eq(clients.id, r.clientId) }),
    db.query.messages.findMany({ where: eq(messages.requestId, id), orderBy: [asc(messages.createdAt)] }),
    db.query.attachments.findMany({ where: eq(attachments.requestId, id) }),
    teamMap(db),
    db.query.outbox.findMany({ where: eq(outbox.requestId, id) }),
  ]);
  const rb = replyByLabel(r.replyBy);
  const [monday, ghl] = await Promise.all([mondayConfig(), ghlConfig()]);
  const mondayRows = queued.filter((q) => q.target === "monday");
  const mondayFailed = mondayRows.some((q) => q.status === "failed");
  const emails = queued.filter((q) => q.target === "ghl" && q.kind === "email");
  const lastEmail = emails.filter((q) => q.status === "sent" && !q.error).sort((a, b) => (b.sentAt ?? 0) - (a.sentAt ?? 0))[0];
  const emailsWaiting = emails.filter((q) => q.status === "pending" || q.status === "sending").length;
  const emailsFailed = emails.filter((q) => q.status === "failed").length;
  const meta = [
    `REQ-${1000 + r.id}`,
    client?.name,
    `asked by ${r.askedBy}`,
    [serviceLabel(r.service), typeLabel(r.service, r.type)].filter(Boolean).join(" · "),
    URGENCY[r.urgency as keyof typeof URGENCY]?.label,
    r.channel !== "hub" ? `came in by ${CHANNELS[r.channel as keyof typeof CHANNELS]?.toLowerCase()}` : null,
    ago(r.createdAt),
  ].filter(Boolean);

  return (
    <>
      <Link className="back" href="/team">
        ← Inbox
      </Link>
      <div className="row between">
        <h1>{r.title}</h1>
        {!r.firstReplyAt && r.status !== "done" && <span className={`sla ${rb.late ? "late" : ""}`}>Reply by {rb.text}</span>}
      </div>
      <p className="muted mono" style={{ fontSize: 12, margin: "2px 0 18px" }}>
        {meta.join(" · ")}
      </p>
      {r.pageUrl && <p style={{ margin: "-8px 0 16px" }}>Page: {r.pageUrl}</p>}

      <div className="grid2 wide">
        <div>
          <Thread messages={msgs} files={files} showInternal initials={(m) => initialsOf(m.authorName)} />
          <TeamReply requestId={r.id} />
        </div>
        <aside className="stack">
          {(await searchParams).saved && <div className="alert ok">Saved. The client&apos;s screen is updated.</div>}
          <UpdateCard
            request={{
              id: r.id,
              status: r.status,
              statusLine: r.statusLine,
              expected: r.expected,
              needText: r.needText,
              needAction: r.needAction,
              ownerId: r.ownerId,
            }}
            team={[...people.values()].filter((t) => t.active).map((t) => ({ id: t.id, name: t.name }))}
            replyByText={rb.text}
          />
          {files.length > 0 && (
            <div className="card">
              <h2>Files</h2>
              <Files files={files} />
            </div>
          )}
          <div className="card">
            <h2>Connected</h2>
            <div className="sync">
              <b>monday</b> ·{" "}
              {!monday ? (
                "not connected"
              ) : r.mondayItemId ? (
                <>
                  on the Hub Requests board ·{" "}
                  <a href={`https://the-idea-farm.monday.com/boards/${monday.boardId}/pulses/${r.mondayItemId}`} target="_blank" rel="noopener noreferrer">
                    open item ↗
                  </a>
                </>
              ) : mondayRows.length === 0 ? (
                "not on monday (came in before monday was connected)"
              ) : mondayFailed ? (
                <>
                  didn&apos;t sync · <Link href="/team/outbox">see the Outbox</Link>
                </>
              ) : (
                "sending…"
              )}
            </div>
            <div className="sync">
              <b>Client emails (GHL)</b> ·{" "}
              {!ghl ? (
                "not connected"
              ) : !client?.emailsOn ? (
                <>
                  off for this client · <Link href="/team/admin">turn on in Admin</Link>
                </>
              ) : (
                <>
                  on, to {client.notifyEmail}
                  <br />
                  {lastEmail ? `Last email ${ago(lastEmail.sentAt!)}` : "No emails sent yet"}
                  {emailsWaiting > 0 && ` · ${emailsWaiting} waiting (sent as one email within 10 min)`}
                  {emailsFailed > 0 && (
                    <>
                      {" "}· {emailsFailed} didn&apos;t send · <Link href="/team/outbox">see the Outbox</Link>
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}
