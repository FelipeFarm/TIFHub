import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { clients, sessions, team, type Client, type Team } from "@/db/schema";

const COOKIE = "hub_session";
const SESSION_DAYS = 30;
const ITERATIONS = 100_000; // Cloudflare Workers' PBKDF2 maximum

const hex = (buf: ArrayBuffer | Uint8Array) =>
  Array.from(buf instanceof Uint8Array ? buf : new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
const unhex = (s: string) => new Uint8Array((s.match(/../g) ?? []).map((h) => parseInt(h, 16)));

export async function hashPassword(password: string, salt = crypto.getRandomValues(new Uint8Array(16)), iterations = ITERATIONS) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256);
  return `pbkdf2$${iterations}$${hex(salt)}$${hex(bits)}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [scheme, it, salt, expected] = stored.split("$");
  if (scheme !== "pbkdf2" || !salt || !expected) return false;
  const actual = (await hashPassword(password, unhex(salt), Number(it))).split("$")[3];
  if (actual.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i++) diff |= actual.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

export type Session = { type: "client"; user: Client } | { type: "team"; user: Team };

export async function createSession(userType: "client" | "team", userId: string, remember: boolean) {
  const db = await getDb();
  const id = hex(crypto.getRandomValues(new Uint8Array(32)));
  const expiresAt = Date.now() + (remember ? SESSION_DAYS : 1) * 86_400_000;
  await db.insert(sessions).values({ id, userType, userId, expiresAt });
  (await cookies()).set(COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    ...(remember ? { expires: new Date(expiresAt) } : {}),
  });
}

export async function getSession(): Promise<Session | null> {
  const id = (await cookies()).get(COOKIE)?.value;
  if (!id) return null;
  const db = await getDb();
  const s = await db.query.sessions.findFirst({ where: eq(sessions.id, id) });
  if (!s || s.expiresAt < Date.now()) return null;
  if (s.userType === "team") {
    const user = await db.query.team.findFirst({ where: eq(team.id, s.userId) });
    return user ? { type: "team", user } : null;
  }
  const user = await db.query.clients.findFirst({ where: eq(clients.id, s.userId) });
  return user ? { type: "client", user } : null;
}

export async function destroySession() {
  const jar = await cookies();
  const id = jar.get(COOKIE)?.value;
  if (id) {
    const db = await getDb();
    await db.delete(sessions).where(eq(sessions.id, id));
  }
  jar.delete(COOKIE);
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
