import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { auditLog, clients, loginAttempts, loginLinks, sessions, team, type Client, type Team } from "@/db/schema";

const COOKIE = "hub_session";
const SESSION_DAYS = 30;
const ITERATIONS = 100_000; // Cloudflare Workers' PBKDF2 maximum

// Lockouts: per email and per network address, counted over a 15-minute window.
const WINDOW_MS = 15 * 60_000;
const LOCK_MS = 15 * 60_000;
const MAX_FAILS_EMAIL = 5;
const MAX_FAILS_IP = 25;

export const LINK_HOURS = { invite: 72, reset: 24 } as const;
export const MIN_PASSWORD = 12;

const hex = (buf: ArrayBuffer | Uint8Array) =>
  Array.from(buf instanceof Uint8Array ? buf : new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
const unhex = (s: string) => new Uint8Array((s.match(/../g) ?? []).map((h) => parseInt(h, 16)));
const randomToken = () => hex(crypto.getRandomValues(new Uint8Array(32)));
export const sha256 = async (s: string) => hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));

/* -------------------------------------------------------------- passwords */

export async function hashPassword(password: string, salt = crypto.getRandomValues(new Uint8Array(16)), iterations = ITERATIONS) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256);
  return `pbkdf2$${iterations}$${hex(salt)}$${hex(bits)}`;
}

// Used when no account matches, so a wrong email takes as long as a wrong password.
const DUMMY_HASH = "pbkdf2$100000$00000000000000000000000000000000$0000000000000000000000000000000000000000000000000000000000000000";
/** Accounts that haven't set a password yet hold this; it never matches anything. */
export const NO_PASSWORD = "unset";

export async function verifyPassword(password: string, stored: string) {
  const [scheme, it, salt, expected] = (stored === NO_PASSWORD ? DUMMY_HASH : stored).split("$");
  if (scheme !== "pbkdf2" || !salt || !expected) return false;
  const actual = (await hashPassword(password, unhex(salt), Number(it))).split("$")[3];
  if (stored === NO_PASSWORD || actual.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i++) diff |= actual.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}
export const burnTime = (password: string) => verifyPassword(password, DUMMY_HASH);

const COMMON = ["password", "123456", "qwerty", "letmein", "welcome", "ideafarm", "theideafarm", "iloveyou", "admin"];
/** Returns a plain-language problem with the password, or null if it's fine. */
export function passwordProblem(password: string, email: string, name: string) {
  if (password.length < MIN_PASSWORD) return `Use at least ${MIN_PASSWORD} characters. A short sentence works well.`;
  if (password.length > 200) return "That's too long. Keep it under 200 characters.";
  const p = password.toLowerCase().replace(/\s+/g, "");
  const local = email.toLowerCase().split("@")[0];
  if (local.length >= 4 && p.includes(local)) return "Don't use your email address in the password.";
  for (const w of name.toLowerCase().split(/\s+/)) if (w.length >= 4 && p.includes(w)) return "Don't use your name in the password.";
  if (COMMON.some((c) => p.includes(c)) && new Set(p).size < 8) return "That one is too easy to guess. Try a short sentence.";
  if (new Set(p).size < 5) return "That one is too easy to guess. Try a short sentence.";
  return null;
}

/* ---------------------------------------------------------------- audit */

export async function clientIp() {
  const h = await headers();
  return h.get("cf-connecting-ip") ?? h.get("x-forwarded-for")?.split(",")[0].trim() ?? "local";
}

export async function audit(actor: string, action: string, target?: string | null, detail?: string | null) {
  const db = await getDb();
  await db.insert(auditLog).values({ at: Date.now(), actor, action, target: target ?? null, detail: detail ?? null, ip: await clientIp() });
}

/* -------------------------------------------------------------- lockouts */

/** True when this email or network address has had too many failed sign-ins recently. */
export async function isLockedOut(email: string) {
  const db = await getDb();
  const now = Date.now();
  for (const key of [`email:${email}`, `ip:${await clientIp()}`]) {
    const row = await db.query.loginAttempts.findFirst({ where: eq(loginAttempts.key, key) });
    if (row?.lockedUntil && row.lockedUntil > now) return true;
  }
  return false;
}

export async function recordFailure(email: string) {
  const db = await getDb();
  const now = Date.now();
  const ip = await clientIp();
  for (const [key, max] of [[`email:${email}`, MAX_FAILS_EMAIL], [`ip:${ip}`, MAX_FAILS_IP]] as const) {
    const row = await db.query.loginAttempts.findFirst({ where: eq(loginAttempts.key, key) });
    const fresh = !row || now - row.firstFailAt > WINDOW_MS;
    const fails = fresh ? 1 : row.fails + 1;
    const lockedUntil = fails >= max ? now + LOCK_MS : null;
    await db
      .insert(loginAttempts)
      .values({ key, fails, firstFailAt: fresh ? now : row.firstFailAt, lockedUntil })
      .onConflictDoUpdate({ target: loginAttempts.key, set: { fails, firstFailAt: fresh ? now : row!.firstFailAt, lockedUntil } });
    if (lockedUntil && (!row?.lockedUntil || row.lockedUntil < now)) await audit("system", "lockout", key, `${fails} failed sign-ins`);
  }
}

export async function clearFailures(email: string) {
  const db = await getDb();
  await db.delete(loginAttempts).where(eq(loginAttempts.key, `email:${email}`));
}

/* -------------------------------------------------------------- sessions */

export type Session = { type: "client"; user: Client } | { type: "team"; user: Team };

export async function createSession(userType: "client" | "team", userId: string, remember: boolean) {
  const db = await getDb();
  const token = randomToken();
  const now = Date.now();
  const expiresAt = now + (remember ? SESSION_DAYS : 1) * 86_400_000;
  await db.insert(sessions).values({ id: await sha256(token), userType, userId, expiresAt, createdAt: now });
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    ...(remember ? { expires: new Date(expiresAt) } : {}),
  });
}

export async function getSession(): Promise<Session | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token || !/^[0-9a-f]{64}$/.test(token)) return null;
  const db = await getDb();
  const s = await db.query.sessions.findFirst({ where: eq(sessions.id, await sha256(token)) });
  if (!s || s.expiresAt < Date.now()) return null;
  if (s.userType === "team") {
    const user = await db.query.team.findFirst({ where: eq(team.id, s.userId) });
    return user?.active ? { type: "team", user } : null;
  }
  const user = await db.query.clients.findFirst({ where: eq(clients.id, s.userId) });
  return user?.active ? { type: "client", user } : null;
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) {
    const db = await getDb();
    await db.delete(sessions).where(eq(sessions.id, await sha256(token)));
  }
  jar.delete(COOKIE);
}

/** Signs someone out on every device (password set, account deactivated). */
export async function endAllSessions(userType: "client" | "team", userId: string) {
  const db = await getDb();
  await db.delete(sessions).where(and(eq(sessions.userType, userType), eq(sessions.userId, userId)));
}

export async function requireClient(): Promise<Client> {
  const s = await getSession();
  if (!s) redirect("/login");
  if (s.type !== "client") redirect("/team");
  return s.user;
}

export async function requireTeam(): Promise<Team> {
  const s = await getSession();
  if (!s) redirect("/login");
  if (s.type !== "team") redirect("/");
  return s.user;
}

export async function requireAdmin(): Promise<Team> {
  const me = await requireTeam();
  if (me.role !== "admin") redirect("/team");
  return me;
}

/* ------------------------------------------------------------ login links */

/** Makes a one-time link to set a password. Any older unused link for that person stops working. */
export async function makeLoginLink(userType: "client" | "team", userId: string, purpose: "invite" | "reset", createdBy: string) {
  const db = await getDb();
  const now = Date.now();
  await db
    .update(loginLinks)
    .set({ usedAt: now })
    .where(and(eq(loginLinks.userType, userType), eq(loginLinks.userId, userId), isNull(loginLinks.usedAt)));
  const token = randomToken();
  const expiresAt = now + LINK_HOURS[purpose] * 3_600_000;
  await db.insert(loginLinks).values({ id: await sha256(token), userType, userId, purpose, createdBy, createdAt: now, expiresAt });
  return { token, expiresAt };
}

/** Finds a link that is still usable, plus the account it belongs to. */
export async function findLoginLink(token: string) {
  if (!/^[0-9a-f]{64}$/.test(token)) return null;
  const db = await getDb();
  const link = await db.query.loginLinks.findFirst({ where: eq(loginLinks.id, await sha256(token)) });
  if (!link || link.usedAt || link.expiresAt < Date.now()) return null;
  const account =
    link.userType === "team"
      ? await db.query.team.findFirst({ where: eq(team.id, link.userId) })
      : await db.query.clients.findFirst({ where: eq(clients.id, link.userId) });
  if (!account?.active) return null;
  const email = "email" in account ? account.email : account.loginEmail;
  return { link, account, email, name: account.name };
}

/* ------------------------------------------------------------ remembered name */

/** The name the person typed last time on this device (shared company login). */
export async function rememberedName() {
  return (await cookies()).get("hub_name")?.value ?? "";
}
export async function rememberName(name: string) {
  (await cookies()).set("hub_name", name.slice(0, 80), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}
