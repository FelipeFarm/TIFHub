import Link from "next/link";
import { asc } from "drizzle-orm";
import { getDb } from "@/db";
import { clients, team } from "@/db/schema";
import { NO_PASSWORD, requireAdmin } from "@/lib/auth";
import { listMondayUsers } from "@/lib/monday";
import { setClientActive, setTeamActive } from "@/app/admin-actions";
import { ClientForm, LinkButton, TeamForm } from "./AdminForms";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  self: "You can't deactivate your own account. Ask another admin.",
  lastadmin: "That's the last admin. Make someone else an admin first.",
};

export default async function Admin({ searchParams }: { searchParams: Promise<{ tab?: string; err?: string }> }) {
  const me = await requireAdmin();
  const sp = await searchParams;
  const tab = sp.tab === "team" ? "team" : "clients";
  const db = await getDb();
  const [clientRows, teamRows, mondayUsers] = await Promise.all([
    db.query.clients.findMany({ orderBy: [asc(clients.name)] }),
    db.query.team.findMany({ orderBy: [asc(team.name)] }),
    tab === "team" ? listMondayUsers() : Promise.resolve([]),
  ]);
  const activeTeam = teamRows.filter((t) => t.active).map((t) => ({ id: t.id, name: t.name }));
  const nameOf = new Map(teamRows.map((t) => [t.id, t.name]));

  return (
    <>
      <div className="row between">
        <h1>Admin</h1>
        <Link href="/team/admin/log" className="btn sm ghost">Access log</Link>
      </div>
      <p className="sub">Who can sign in. Passwords are never shown or sent by us: each person sets their own with a one-time link.</p>
      {sp.err && ERRORS[sp.err] && <div className="alert err">{ERRORS[sp.err]}</div>}

      <div className="filters" role="tablist" style={{ marginBottom: 16 }}>
        <Link href="/team/admin" className={tab === "clients" ? "on" : ""} role="tab" aria-selected={tab === "clients"}>
          Clients ({clientRows.filter((c) => c.active).length})
        </Link>
        <Link href="/team/admin?tab=team" className={tab === "team" ? "on" : ""} role="tab" aria-selected={tab === "team"}>
          Team ({teamRows.filter((t) => t.active).length})
        </Link>
      </div>

      {tab === "clients" ? (
        <div className="grid2 wide">
          <div className="stack">
            {clientRows.map((c) => {
              const waiting = c.passwordHash === NO_PASSWORD;
              return (
                <details className="card" key={c.id} style={c.active ? undefined : { opacity: 0.6 }}>
                  <summary className="row between" style={{ cursor: "pointer", listStyle: "none" }}>
                    <span>
                      <b>{c.name}</b>
                      <small className="muted" style={{ display: "block" }}>
                        {c.loginEmail} · Lead: {(c.leadId && nameOf.get(c.leadId)) || "not set"}
                        {c.backupId ? ` · Backup: ${nameOf.get(c.backupId) ?? "?"}` : ""}
                      </small>
                    </span>
                    {!c.active ? (
                      <span className="pill">Deactivated</span>
                    ) : waiting ? (
                      <span className="pill you">Hasn&apos;t set a password</span>
                    ) : (
                      <span className="pill done">Active</span>
                    )}
                  </summary>
                  <div className="stack" style={{ marginTop: 14 }}>
                    {c.active && <ClientForm team={activeTeam} client={c} />}
                    {c.active && <LinkButton userType="client" id={c.id} waiting={waiting} />}
                    <form action={setClientActive}>
                      <input type="hidden" name="id" value={c.id} />
                      <input type="hidden" name="active" value={c.active ? "0" : "1"} />
                      <button className="btn sm ghost">{c.active ? "Deactivate (signs them out now)" : "Reactivate"}</button>
                    </form>
                  </div>
                </details>
              );
            })}
            {!clientRows.length && <div className="empty">No clients yet.</div>}
          </div>
          <aside className="card">
            <h2>Add a client</h2>
            <ClientForm team={activeTeam} />
          </aside>
        </div>
      ) : (
        <div className="grid2 wide">
          <div className="stack">
            {teamRows.map((t) => {
              const waiting = t.passwordHash === NO_PASSWORD;
              const isSelf = t.id === me.id;
              return (
                <details className="card" key={t.id} style={t.active ? undefined : { opacity: 0.6 }}>
                  <summary className="row between" style={{ cursor: "pointer", listStyle: "none" }}>
                    <span>
                      <b>{t.name}</b>
                      {isSelf && <span className="muted"> (you)</span>}
                      <small className="muted" style={{ display: "block" }}>
                        {t.email} · {t.role === "admin" ? "Admin" : "Team"}
                        {t.mondayUserId ? " · monday linked" : " · monday not linked"}{t.slackUserId ? " · Slack linked" : ""}
                      </small>
                    </span>
                    {!t.active ? (
                      <span className="pill">Deactivated</span>
                    ) : waiting ? (
                      <span className="pill you">Hasn&apos;t set a password</span>
                    ) : (
                      <span className="pill done">Active</span>
                    )}
                  </summary>
                  <div className="stack" style={{ marginTop: 14 }}>
                    {t.active && <TeamForm member={t} mondayUsers={mondayUsers} isSelf={isSelf} />}
                    {t.active && !isSelf && <LinkButton userType="team" id={t.id} waiting={waiting} />}
                    {!isSelf && (
                      <form action={setTeamActive}>
                        <input type="hidden" name="id" value={t.id} />
                        <input type="hidden" name="active" value={t.active ? "0" : "1"} />
                        <button className="btn sm ghost">{t.active ? "Deactivate (signs them out now)" : "Reactivate"}</button>
                      </form>
                    )}
                  </div>
                </details>
              );
            })}
          </div>
          <aside className="card">
            <h2>Add a team member</h2>
            <TeamForm mondayUsers={mondayUsers} />
          </aside>
        </div>
      )}
    </>
  );
}
