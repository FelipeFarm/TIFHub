import { eq } from "drizzle-orm";
import { getDb, getEnv } from "@/db";
import { attachments } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { INLINE } from "@/lib/files";

const notFound = () => new Response("Not found", { status: 404 });

/** Serves uploaded files. Clients can only open their own company's files. */
export async function GET(_req: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const session = await getSession();
  if (!session) return notFound();
  const key = (await params).key.map((p) => decodeURIComponent(p)).join("/");
  const db = await getDb();
  const att = await db.query.attachments.findFirst({ where: eq(attachments.key, key) });
  if (!att) return notFound();
  if (session.type === "client" && att.clientId !== session.user.id) return notFound();
  const obj = await (await getEnv()).FILES.get(key);
  if (!obj) return notFound();
  const inline = INLINE.test(att.type);
  return new Response(obj.body as ReadableStream, {
    headers: {
      "content-type": inline ? att.type : "application/octet-stream",
      "content-disposition": `${inline ? "inline" : "attachment"}; filename="${att.name.replace(/["\\\r\n]/g, "_")}"`,
      // no-store: shared office computers shouldn't keep client files after sign-out.
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
