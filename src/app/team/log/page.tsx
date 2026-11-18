import Link from "next/link";
import { getDb } from "@/db";
import { requireTeam } from "@/lib/auth";
import { teamMap } from "@/lib/queries";
import { LogForm } from "./LogForm";

export default async function LogPage() {
  const me = await requireTeam();
  const db = await getDb();
  const [clientRows, people] = await Promise.all([
    db.query.clients.findMany({ orderBy: (c, { asc }) => [asc(c.name)] }),
    teamMap(db),
  ]);
  return (
    <div className="narrow">
      <Link className="back" href="/team">
        ← Inbox
      </Link>
      <h1>Log a request</h1>
      <p className="sub">
        When a client emails, calls or texts instead of using the Hub, put it here so it&apos;s tracked like everything else.
      </p>
      <LogForm
        me={me.id}
        clients={clientRows.filter((c) => c.active).map((c) => ({ id: c.id, name: c.name, leadId: c.leadId }))}
        team={[...people.values()].filter((t) => t.active).map((t) => ({ id: t.id, name: t.name }))}
      />
    </div>
  );
}
