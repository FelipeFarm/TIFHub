import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { clients } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { checkFiles, fileUrl, saveFiles } from "@/lib/files";

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
  const origin = req.headers.get("origin");
  if (origin && new URL(origin).host !== new URL(req.url).host) return Response.json({ error: "Wrong origin" }, { status: 403 });

  const fd = await req.formData();
  const clientId = String(fd.get("clientId") ?? "").slice(0, 40);
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return Response.json({ error: "No file" }, { status: 400 });
  const db = await getDb();
  const client = await db.query.clients.findFirst({ where: and(eq(clients.id, clientId), eq(clients.active, true)) });
  if (!client) return Response.json({ error: "Pick a client first." }, { status: 400 });
  const problem = checkFiles([file]);
  if (problem) return Response.json({ error: problem }, { status: 400 });

  const [saved] = await saveFiles([file], { clientId: client.id });
  return Response.json({ key: saved.key, name: saved.name, type: saved.type, url: fileUrl(saved.key) });
}
