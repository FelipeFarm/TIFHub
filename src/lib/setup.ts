// First-admin setup for an environment where nobody can run scripts against the database
// (Webflow Cloud manages it). The /setup page only exists while BOTH are true:
//   1. a SETUP_SECRET of 24+ characters is set (a Webflow Cloud secret variable), and
//   2. no admin has set a password yet.
// Once the first admin sets their password, /setup is gone for good (remove the secret too).
import { and, eq, ne } from "drizzle-orm";
import { getDb, getEnv } from "@/db";
import { team } from "@/db/schema";
import { NO_PASSWORD } from "./auth";

export async function setupSecret() {
  const env = (await getEnv()) as unknown as Record<string, string | undefined>;
  const s = env.SETUP_SECRET?.trim();
  return s && s.length >= 24 ? s : null;
}

export async function setupOpen() {
  if (!(await setupSecret())) return false;
  const db = await getDb();
  const ready = await db.query.team.findFirst({
    where: and(eq(team.role, "admin"), eq(team.active, true), ne(team.passwordHash, NO_PASSWORD)),
  });
  return !ready;
}

/** Constant-time comparison, so the secret can't be guessed one character at a time. */
export function sameSecret(a: string, b: string) {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}
