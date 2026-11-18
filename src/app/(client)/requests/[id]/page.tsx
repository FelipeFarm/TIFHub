import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { attachments, messages, requests } from "@/db/schema";
import { rememberedName, requireClient } from "@/lib/auth";
import { serviceLabel, typeLabel } from "@/lib/constants";
import { teamMap } from "@/lib/queries";
import { clientBanner } from "@/lib/sentences";
import { fmtDateInput, fmtDay, replyByLabel } from "@/lib/time";
import { BannerBox, Files, initialsOf, Stepper, Thread } from "@/components/ui";
import { ClientReply } from "./ClientReply";

export default async function RequestPage({ params }: { params: Promise<{ id: string }> }) {
  const client = await requireClient();
  const id = Number((await params).id);
  const db = await getDb();
  const r = await db.query.requests.findFirst({ where: and(eq(requests.id, id), eq(requests.clientId, client.id)) });
  if (!r) notFound();
  const [msgs, files, people] = await Promise.all([
    db.query.messages.findMany({ where: and(eq(messages.requestId, id), eq(messages.internal, false)), orderBy: [asc(messages.createdAt)] }),
    db.query.attachments.findMany({ where: eq(attachments.requestId, id) }),
    teamMap(db),
  ]);
  const owner = r.ownerId ? people.get(r.ownerId) : undefined;
  const banner = clientBanner({ ...r, ownerName: owner?.name, replyByText: replyByLabel(r.replyBy).text });
  const kind = [serviceLabel(r.service), typeLabel(r.service, r.type)].filter(Boolean).join(" · ");

  return (
    <>
      <Link className="back" href="/">
        ← Back
      </Link>
      <h1>{r.title}</h1>
      <p className="muted mono" style={{ fontSize: 12, margin: "2px 0 0" }}>
        REQ-{1000 + r.id} · {kind} · Asked by {r.askedBy} on {fmtDay(r.createdAt)}
      </p>
      <BannerBox b={banner} href="#reply" />
      <Stepper status={r.status} />

      <div className="grid2">
        <div>
          <Thread
            messages={msgs}
            files={files}
            clientSide
            initials={(m) => initialsOf(m.authorName)}
          />
          <ClientReply requestId={r.id} defaultName={await rememberedName()} highlight={r.status === "your_turn"} />
        </div>
        <aside className="card meta-list">
          <div>
            <span>Who&apos;s on it</span>
            {owner?.name ?? "Your team"}
          </div>
          {r.expected && r.status !== "done" && (
            <div>
              <span>Expected</span>
              {fmtDateInput(r.expected)}
            </div>
          )}
          {r.pageUrl && (
            <div>
              <span>Page</span>
              {r.pageUrl}
            </div>
          )}
          {files.length > 0 && (
            <div>
              <span>Files</span>
              <Files files={files} />
            </div>
          )}
        </aside>
      </div>
    </>
  );
}
