// Creates the first admin (or a new welcome link for an existing team member) and prints
// a one-time sign-in link. Use it once per environment; after that, admins add people in the Hub.
//
//   npm run admin:invite -- --name "Jose Escalera" --email jose@theideafarm.com
//   npm run admin:invite -- --name "Jose Escalera" --email jose@theideafarm.com --remote --url https://hub.theideafarm.com
//
// The link is printed to this terminal only. It isn't saved anywhere and works once.
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const arg = (k) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > -1 ? process.argv[i + 1] : undefined;
};
const name = arg("name")?.trim();
const email = arg("email")?.trim().toLowerCase();
const remote = process.argv.includes("--remote");
const url = (arg("url") ?? (remote ? "https://hub.theideafarm.com" : "http://localhost:4183")).replace(/\/$/, "");
if (!name || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error('Usage: npm run admin:invite -- --name "Full Name" --email person@theideafarm.com [--remote --url https://…]');
  process.exit(1);
}

const q = (v) => `'${String(v).replace(/'/g, "''")}'`;
const token = randomBytes(32).toString("hex");
const linkId = createHash("sha256").update(token).digest("hex");
const now = Date.now();
const id = `t_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
const initials = name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();

// Adds the person as an admin if the email is new; if it exists, makes them admin and active.
const sql = `
INSERT INTO team (id, name, initials, email, password_hash, role, active)
  VALUES (${q(id)}, ${q(name)}, ${q(initials)}, ${q(email)}, 'unset', 'admin', 1)
  ON CONFLICT(email) DO UPDATE SET role = 'admin', active = 1;
UPDATE login_links SET used_at = ${now}
  WHERE user_type = 'team' AND used_at IS NULL AND user_id = (SELECT id FROM team WHERE email = ${q(email)});
INSERT INTO login_links (id, user_type, user_id, purpose, created_by, created_at, expires_at)
  SELECT ${q(linkId)}, 'team', id, CASE WHEN password_hash = 'unset' THEN 'invite' ELSE 'reset' END, 'setup script', ${now}, ${now + 72 * 3_600_000}
  FROM team WHERE email = ${q(email)};
INSERT INTO audit_log (at, actor, action, target, detail, ip)
  VALUES (${now}, 'setup script', 'made admin + welcome link', ${q(name)}, ${q(email)}, 'terminal');
`;

const dir = mkdtempSync(join(tmpdir(), "hub-admin-"));
const file = join(dir, "invite.sql");
try {
  writeFileSync(file, sql, { mode: 0o600 });
  execFileSync("npx", ["wrangler", "d1", "execute", "DB", remote ? "--remote" : "--local", `--file=${file}`], { stdio: ["ignore", "ignore", "inherit"] });
} finally {
  rmSync(dir, { recursive: true, force: true });
}
console.log(`\n${name} is an admin. One-time sign-in link (valid 72 hours, works once):\n\n  ${url}/set-password/${token}\n\nSend it to them directly. Don't post it in a shared channel.\n`);
