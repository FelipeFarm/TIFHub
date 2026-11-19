import { and, eq } from "drizzle-orm";
import { getDb, getEnv } from "@/db";
import { clients } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { checkFiles, fileUrl, saveFiles } from "@/lib/files";

// Expected problems come back as 200 + { error }: Webflow Cloud replaces some error pages with its
// own, which would hide the reason from the team.
const problem = (error: string) => Response.json({ error });

/**
 * Team-only: uploads ONE file for an approval that's being put together, so a month of posts
 * goes up file by file instead of in one huge request. The file belongs to the chosen client
 * from the start (only that client and the team can open it) and is linked to the approval
 * when the team clicks "Send to client".
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session || session.type !== "team") return Response.json({ error: "Not signed in" }, { status: 401 });
  // Same-site only: blocks other websites from posting files with a team member's cookie.
  // Behind Webflow Cloud the request URL is an internal address, so compare with the Hub's real
  // addresses (HUB_URL, plus the Host headers the proxy passes on) instead.
  const origin = req.headers.get("origin");
  if (origin) {
    const env = (await getEnv()) as unknown as Record<string, string | undefined>;
    const allowed = new Set(
      [env.HUB_URL, req.url, req.headers.get("host") && `https://${req.headers.get("host")}`, req.headers.get("x-forwarded-host") && `https://${req.headers.get("x-forwarded-host")}`]
        .filter((x): x is string => !!x)
        .map((x) => { try { return new URL(x).host; } catch { return ""; } }),
    );
    let host = "";
    try { host = new URL(origin).host; } catch {}
    if (!allowed.has(host)) return Response.json({ error: "This upload came from another website, so it was blocked." }, { status: 403 });
  }

  const fd = await req.formData();
  const clientId = String(fd.get("clientId") ?? "").slice(0, 40);
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return problem("That file is empty.");
  const db = await getDb();
  const client = await db.query.clients.findFirst({ where: and(eq(clients.id, clientId), eq(clients.active, true)) });
  if (!client) return problem("Pick a client first.");
  const bad = checkFiles([file]);
  if (bad) return problem(bad);

  const [saved] = await saveFiles([file], { clientId: client.id });
  return Response.json({ key: saved.key, name: saved.name, type: saved.type, url: fileUrl(saved.key) });
}
