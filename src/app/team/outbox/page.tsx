import Link from "next/link";
import { desc } from "drizzle-orm";
import { getDb } from "@/db";
import { outbox } from "@/db/schema";
import { requireTeam } from "@/lib/auth";
import { mondayConfig } from "@/lib/monday";
import { slackConfig } from "@/lib/slack";
import { ago } from "@/lib/time";
import { retryOutbox } from "@/app/actions";

const STATE: Record<string, { label: string; cls: string }> = {
  sent: { label: "Sent", cls: "done" },
  pending: { label: "Waiting", cls: "rec" },
  sending: { label: "Sending…", cls: "prog" },
  failed: { label: "Didn't send", cls: "you" },
  skipped: { label: "Not sent", cls: "" },
};

export default async function Outbox({ searchParams }: { searchParams: Promise<{ retried?: string }> }) {
  await requireTeam();
  const db = await getDb();
  const [rows, cfg, slack] = await Promise.all([
    db.query.outbox.findMany({ orderBy: [desc(outbox.createdAt)], limit: 200 }),
    mondayConfig(),
    slackConfig(),
  ]);
  const stuck = rows.filter(
    (r) => ((r.target === "monday" && cfg) || (r.target === "slack" && slack)) && (r.status === "failed" || r.status === "pending"),
  ).length;

  return (
    <>
      <h1>Outbox</h1>
      <p className="sub">
        Everything the Hub sends out. monday: {cfg ? <b>connected</b> : <b>not connected</b>} · Slack alerts:{" "}
        {slack ? <b>connected</b> : <b>not connected</b>} · GHL client emails: <b>not connected yet</b> (they wait here).
      </p>
      {(await searchParams).retried && <div className="alert ok">Tried again. Check the list below.</div>}
      {stuck > 0 && (
        <form action={retryOutbox} className="row" style={{ margin: "0 0 14px", gap: 10 }}>
          <span>
            {stuck} update{stuck > 1 ? "s" : ""} didn&apos;t go through.
          </span>
          <button className="btn sm">Send again</button>
        </form>
      )}
      <div className="tablewrap">
        <table>
          <thead>
            <tr>
              <th>To</th>
              <th>What</th>
              <th>Status</th>
              <th>When</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const notConnected = r.status === "pending" && (r.target === "ghl" || (r.target === "slack" && !slack) || (r.target === "monday" && !cfg));
              const st = notConnected ? { label: "Not connected", cls: "" } : STATE[r.status] ?? STATE.pending;
              return (
                <tr key={r.id}>
                  <td>
                    <span className="pill">{r.target === "ghl" ? "GHL" : r.target === "slack" ? "Slack" : "monday"}</span>
                  </td>
                  <td>
                    {r.requestId ? <Link href={`/team/requests/${r.requestId}`}>{r.summary}</Link> : r.summary}
                    <small>{r.error && r.status !== "sent" ? r.error : r.kind}</small>
                  </td>
                  <td>
                    <span className={`pill ${st.cls}`}>{st.label}</span>
                  </td>
                  <td className="sla">{ago(r.createdAt)}</td>
                </tr>
              );
            })}
            {!rows.length && (
              <tr className="none">
                <td colSpan={4}>Nothing yet. Send a request or reply and it shows up here.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
