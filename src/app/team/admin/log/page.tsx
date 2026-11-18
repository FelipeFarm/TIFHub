import Link from "next/link";
import { desc } from "drizzle-orm";
import { getDb } from "@/db";
import { auditLog } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { fmtDayTime } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function AccessLog() {
  await requireAdmin();
  const db = await getDb();
  const rows = await db.query.auditLog.findMany({ orderBy: [desc(auditLog.at)], limit: 300 });
  return (
    <>
      <Link href="/team/admin" className="back">← Admin</Link>
      <h1>Access log</h1>
      <p className="sub">Sign-ins, lockouts, accounts added or deactivated, and sign-in links made. Newest first, last 300.</p>
      <div className="tablewrap">
        <table>
          <thead>
            <tr>
              <th>When</th>
              <th>Who</th>
              <th>What</th>
              <th>Network</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="sla">{fmtDayTime(r.at)}</td>
                <td>{r.actor}</td>
                <td>
                  {r.action}
                  {r.target ? <> · <b>{r.target}</b></> : null}
                  {r.detail ? <small>{r.detail}</small> : null}
                </td>
                <td className="mono" style={{ fontSize: 12 }}>{r.ip}</td>
              </tr>
            ))}
            {!rows.length && (
              <tr className="none">
                <td colSpan={4}>Nothing yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
