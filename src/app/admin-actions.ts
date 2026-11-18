"use server";

// Access control: adding clients and team, deactivating them, and one-time sign-in links.
// Every action here re-checks that the caller is an admin, and every change is written to the access log.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, isNull, ne } from "drizzle-orm";
import { getDb, getEnv } from "@/db";
import { clients, loginLinks, team } from "@/db/schema";
import {
  LINK_HOURS, NO_PASSWORD, audit, clearFailures, createSession, endAllSessions, findLoginLink, hashPassword,
  isLockedOut, makeLoginLink, passwordProblem, recordFailure, requireAdmin,
} from "@/lib/auth";
import { sameSecret, setupOpen, setupSecret } from "@/lib/setup";
import { fmtDayTime } from "@/lib/time";

export type AdminState = { error?: string; ok?: string; link?: string; linkFor?: string; linkExpires?: string } | undefined;

const str = (fd: FormData, k: string, max = 200) => String(fd.get(k) ?? "").trim().slice(0, max);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function hubUrl() {
  const env = (await getEnv()) as unknown as Record<string, string | undefined>;
  return (env.HUB_URL || "https://hub.theideafarm.com").replace(/\/$/, "");
}

async function linkState(userType: "client" | "team", id: string, purpose: "invite" | "reset", who: string, by: string): Promise<AdminState> {
  const { token, expiresAt } = await makeLoginLink(userType, id, purpose, by);
  await audit(by, purpose === "invite" ? "made welcome link" : "made reset link", `${userType}:${who}`, `valid ${LINK_HOURS[purpose]} hours`);
  return { link: `${await hubUrl()}/set-password/${token}`, linkFor: who, linkExpires: fmtDayTime(expiresAt) };
}

/** An email can belong to one account only, across clients and team. */
async function emailTaken(email: string, except?: { type: "client" | "team"; id: string }) {
  const db = await getDb();
  const c = await db.query.clients.findFirst({ where: eq(clients.loginEmail, email) });
  const t = await db.query.team.findFirst({ where: eq(team.email, email) });
  if (c && !(except?.type === "client" && except.id === c.id)) return true;
  if (t && !(except?.type === "team" && except.id === t.id)) return true;
  return false;
}

const newId = (prefix: string) => `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
const initialsOf = (name: string) =>
  name.split(/\s+/).filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase() || "?";

/* --------------------------------------------------------------- clients */

export async function saveClient(_: AdminState, fd: FormData): Promise<AdminState> {
  const me = await requireAdmin();
  const id = str(fd, "id", 40);
  const name = str(fd, "name", 120);
  const loginEmail = str(fd, "loginEmail").toLowerCase();
  const leadId = str(fd, "leadId", 40) || null;
  const backupId = str(fd, "backupId", 40) || null;
  if (!name) return { error: "Add the company name." };
  if (!EMAIL.test(loginEmail)) return { error: "That sign-in email doesn't look right." };
  if (leadId && leadId === backupId) return { error: "The backup should be a different person from the account lead." };
  if (await emailTaken(loginEmail, id ? { type: "client", id } : undefined)) return { error: "Another account already uses that email." };

  const db = await getDb();
  if (!id) {
    const cid = newId("c");
    await db.insert(clients).values({ id: cid, name, loginEmail, passwordHash: NO_PASSWORD, leadId, backupId, createdAt: Date.now() });
    await audit(me.name, "added client", name, loginEmail);
    revalidatePath("/team/admin");
    return { ok: `${name} is added. Send them this link so they can choose their password.`, ...(await linkState("client", cid, "invite", name, me.name)) };
  }
  const before = await db.query.clients.findFirst({ where: eq(clients.id, id) });
  if (!before) return { error: "Client not found." };
  await db.update(clients).set({ name, loginEmail, leadId, backupId }).where(eq(clients.id, id));
  if (before.loginEmail !== loginEmail) {
    // A new sign-in email signs everyone out; they keep their password.
    await endAllSessions("client", id);
    await audit(me.name, "changed client sign-in email", name, `${before.loginEmail} → ${loginEmail}`);
  } else {
    await audit(me.name, "edited client", name);
  }
  revalidatePath("/team/admin");
  return { ok: `${name} is saved.` };
}

export async function setClientActive(fd: FormData) {
  const me = await requireAdmin();
  const id = str(fd, "id", 40);
  const active = fd.get("active") === "1";
  const db = await getDb();
  const c = await db.query.clients.findFirst({ where: eq(clients.id, id) });
  if (!c) redirect("/team/admin");
  await db.update(clients).set({ active }).where(eq(clients.id, id));
  if (!active) {
    await endAllSessions("client", id);
    await db.update(loginLinks).set({ usedAt: Date.now() }).where(and(eq(loginLinks.userType, "client"), eq(loginLinks.userId, id)));
  }
  await audit(me.name, active ? "reactivated client" : "deactivated client", c.name);
  revalidatePath("/team/admin");
}

/* ------------------------------------------------------------------ team */

export async function saveTeamMember(_: AdminState, fd: FormData): Promise<AdminState> {
  const me = await requireAdmin();
  const id = str(fd, "id", 40);
  const name = str(fd, "name", 120);
  const email = str(fd, "email").toLowerCase();
  const role = fd.get("role") === "admin" ? "admin" : "account_lead";
  const mondayUserId = str(fd, "mondayUserId", 20).replace(/\D/g, "") || null;
  const slackUserId = str(fd, "slackUserId", 20).toUpperCase() || null;
  if (slackUserId && !/^[UW][A-Z0-9]{6,}$/.test(slackUserId)) return { error: "The Slack member ID starts with U, like U04ABC123. Find it in their Slack profile → ⋯ → Copy member ID." };
  if (!name) return { error: "Add their name." };
  if (!EMAIL.test(email)) return { error: "That email doesn't look right." };
  if (await emailTaken(email, id ? { type: "team", id } : undefined)) return { error: "Another account already uses that email." };
  if (id === me.id && role !== "admin") return { error: "You can't remove your own admin access. Ask another admin." };

  const db = await getDb();
  if (!id) {
    const tid = newId("t");
    await db.insert(team).values({ id: tid, name, initials: initialsOf(name), email, passwordHash: NO_PASSWORD, role, mondayUserId, slackUserId });
    await audit(me.name, "added team member", name, `${email} · ${role}`);
    revalidatePath("/team/admin");
    return { ok: `${name} is added. Send them this link so they can choose their password.`, ...(await linkState("team", tid, "invite", name, me.name)) };
  }
  const before = await db.query.team.findFirst({ where: eq(team.id, id) });
  if (!before) return { error: "Team member not found." };
  await db.update(team).set({ name, initials: initialsOf(name), email, role, mondayUserId, slackUserId }).where(eq(team.id, id));
  if (before.role !== role) await audit(me.name, role === "admin" ? "made admin" : "removed admin", name);
  if (before.email !== email) {
    await endAllSessions("team", id);
    await audit(me.name, "changed team email", name, `${before.email} → ${email}`);
  }
  if (before.role === role && before.email === email) await audit(me.name, "edited team member", name);
  revalidatePath("/team/admin");
  return { ok: `${name} is saved.` };
}

export async function setTeamActive(fd: FormData) {
  const me = await requireAdmin();
  const id = str(fd, "id", 40);
  const active = fd.get("active") === "1";
  if (id === me.id) redirect("/team/admin?tab=team&err=self");
  const db = await getDb();
  const t = await db.query.team.findFirst({ where: eq(team.id, id) });
  if (!t) redirect("/team/admin?tab=team");
  if (!active && t.role === "admin") {
    const others = await db.query.team.findMany({ where: and(eq(team.role, "admin"), eq(team.active, true), ne(team.id, id)) });
    if (!others.length) redirect("/team/admin?tab=team&err=lastadmin");
  }
  await db.update(team).set({ active }).where(eq(team.id, id));
  if (!active) {
    await endAllSessions("team", id);
    await db.update(loginLinks).set({ usedAt: Date.now() }).where(and(eq(loginLinks.userType, "team"), eq(loginLinks.userId, id)));
  }
  await audit(me.name, active ? "reactivated team member" : "deactivated team member", t.name);
  revalidatePath("/team/admin");
}

/* ----------------------------------------------------------- reset links */

export async function makeResetLink(_: AdminState, fd: FormData): Promise<AdminState> {
  const me = await requireAdmin();
  const userType = fd.get("userType") === "team" ? "team" : "client";
  const id = str(fd, "id", 40);
  const db = await getDb();
  const acct =
    userType === "team"
      ? await db.query.team.findFirst({ where: eq(team.id, id) })
      : await db.query.clients.findFirst({ where: eq(clients.id, id) });
  if (!acct?.active) return { error: "That account is deactivated. Reactivate it first." };
  const purpose = acct.passwordHash === NO_PASSWORD ? "invite" : "reset";
  return {
    ok: purpose === "invite" ? "New welcome link. The old one no longer works." : "Reset link ready. Their current password keeps working until they use it.",
    ...(await linkState(userType, id, purpose, acct.name, me.name)),
  };
}

/* ---------------------------------------------------------- set password */

export async function setPassword(_: AdminState, fd: FormData): Promise<AdminState> {
  const token = str(fd, "token", 64);
  const password = String(fd.get("password") ?? "");
  const confirm = String(fd.get("confirm") ?? "");
  const found = await findLoginLink(token);
  if (!found) return { error: "This link has expired or was already used. Ask your Idea Farm contact for a new one." };
  const problem = passwordProblem(password, found.email, found.name);
  if (problem) return { error: problem };
  if (password !== confirm) return { error: "The two passwords don't match." };

  const db = await getDb();
  const { link } = found;
  // Mark the link used first, so the same link can't be used twice at the same moment.
  const claimed = await db
    .update(loginLinks)
    .set({ usedAt: Date.now() })
    .where(and(eq(loginLinks.id, link.id), isNull(loginLinks.usedAt)))
    .returning({ id: loginLinks.id });
  if (!claimed.length) return { error: "This link was just used. Ask your Idea Farm contact for a new one." };

  const passwordHash = await hashPassword(password);
  const userType = link.userType === "team" ? "team" : "client";
  if (userType === "team") await db.update(team).set({ passwordHash }).where(eq(team.id, link.userId));
  else await db.update(clients).set({ passwordHash }).where(eq(clients.id, link.userId));
  await endAllSessions(userType, link.userId);
  await clearFailures(found.email);
  await audit(found.name, link.purpose === "invite" ? "set first password" : "reset password", userType);
  await createSession(userType, link.userId, false);
  redirect(userType === "team" ? "/team" : "/");
}

/* ------------------------------------------------------------ first admin */

export async function createFirstAdmin(_: AdminState, fd: FormData): Promise<AdminState> {
  if (!(await setupOpen())) return { error: "Setup is closed." };
  const secret = String(fd.get("secret") ?? "");
  const name = str(fd, "name", 120);
  const email = str(fd, "email").toLowerCase();
  // Wrong secrets count toward the same lockout as sign-ins (per network address).
  if (await isLockedOut("setup")) return { error: "Too many tries. Wait 15 minutes." };
  if (!sameSecret(secret, (await setupSecret())!)) {
    await recordFailure("setup");
    await audit("unknown", "wrong setup secret", null, null);
    return { error: "That setup secret isn't right." };
  }
  if (!name) return { error: "Add your name." };
  if (!EMAIL.test(email)) return { error: "That email doesn't look right." };

  const db = await getDb();
  const existing = await db.query.team.findFirst({ where: eq(team.email, email) });
  let id = existing?.id;
  if (existing) {
    await db.update(team).set({ role: "admin", active: true, name, initials: initialsOf(name) }).where(eq(team.id, existing.id));
  } else {
    if (await emailTaken(email)) return { error: "That email is used by a client account." };
    id = newId("t");
    await db.insert(team).values({ id, name, initials: initialsOf(name), email, passwordHash: NO_PASSWORD, role: "admin" });
  }
  await clearFailures("setup");
  await audit(name, "first admin set up", email);
  const { token } = await makeLoginLink("team", id!, "invite", "setup page");
  redirect(`/set-password/${token}`);
}
