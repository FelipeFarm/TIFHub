import Link from "next/link";
import { desc } from "drizzle-orm";
import { getDb } from "@/db";
import { outbox } from "@/db/schema";
import { requireTeam } from "@/lib/auth";
import { ago } from "@/lib/time";

export default async function Outbox() {
  await requireTeam();
  const db = await getDb();
  const rows = await db.query.outbox.findMany({ orderBy: [desc(outbox.createdAt)], limit: 200 });
  return (
    <>
      <h1>Outbox</h1>
      <p className="sub">
        Trial build: nothing leaves the Hub yet. This is what <b>would</b> be sent to GHL (client emails) and monday once
        step 4 connects them.
      </p>
      <div className="tablewrap">
        <table>
          <thead>
            <tr>
              <th>To</th>
              <th>What</th>
              <th>When</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>
                  <span className="pill">{r.target === "ghl" ? "GHL" : "monday"}</span>
                </td>
                <td>
                  {r.requestId ? <Link href={`/team/requests/${r.requestId}`}>{r.summary}</Link> : r.summary}
                  <small>{r.kind}</small>
                </td>
                <td className="sla">{ago(r.createdAt)}</td>
              </tr>
            ))}
            {!rows.length && (
              <tr className="none">
                <td colSpan={3}>Nothing queued yet. Send a request or reply and it shows up here.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
