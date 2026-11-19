import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { approvalItems, approvals, attachments } from "@/db/schema";
import { rememberedName, requireClient } from "@/lib/auth";
import { fileUrl } from "@/lib/files";
import { linkLabel, safeLink } from "@/lib/links";
import { teamMap } from "@/lib/queries";
import { firstName } from "@/lib/sentences";
import { fmtDateInput, fmtDay } from "@/lib/time";
import { ReviewForm } from "./ReviewForm";

export default async function ApprovalPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ done?: string }>;
}) {
  const client = await requireClient();
  const id = Number((await params).id);
  const db = await getDb();
  const a = await db.query.approvals.findFirst({ where: and(eq(approvals.id, id), eq(approvals.clientId, client.id)) });
  if (!a) notFound();
  const items = await db.query.approvalItems.findMany({ where: eq(approvalItems.approvalId, id), orderBy: [asc(approvalItems.position)] });
  const owner = a.ownerId ? (await teamMap(db)).get(a.ownerId) : undefined;
  const keys = items.map((i) => i.imageKey).filter((k): k is string => !!k);
  const files = keys.length ? await db.query.attachments.findMany({ where: inArray(attachments.key, keys) }) : [];
  const fileOf = (key: string | null) => {
    const f = key ? files.find((x) => x.key === key) : undefined;
    if (!f) return null;
    const kind: "image" | "pdf" | "other" = f.type.startsWith("image/") ? "image" : f.type === "application/pdf" ? "pdf" : "other";
    return { url: fileUrl(f.key), kind, name: f.name };
  };

  if ((await searchParams).done) {
    const changes = items.filter((i) => i.decision === "changes").length;
    return (
      <div className="sent">
        <div className="bigcheck">✓</div>
        <h1>Thanks! Review sent.</h1>
        <p className="sub">
          {changes
            ? `Approved items will go ahead as planned. ${firstName(owner?.name) || "We"} will fix the ${changes} you marked and send ${changes === 1 ? "it" : "them"} back.`
            : "Everything is approved and will go ahead as planned."}
        </p>
        <Link className="btn" href="/">
          Back to home
        </Link>
      </div>
    );
  }

  return (
    <>
      <Link className="back" href="/">
        ← Back
      </Link>
      <h1>{a.title}</h1>
      {a.note && (
        <p className="sub" style={{ marginBottom: 8 }}>
          <b>{firstName(owner?.name) || "Note"}:</b> {a.note}
        </p>
      )}
      {a.status === "sent" ? (
        <ReviewForm
          approvalId={a.id}
          due={a.due ? fmtDateInput(a.due) : null}
          defaultName={await rememberedName()}
          kind={a.kind === "blog" ? "blog" : "posts"}
          items={items.map((i) => {
            const link = safeLink(i.linkUrl);
            return {
              id: i.id,
              caption: i.caption,
              when: i.whenLabel,
              file: fileOf(i.imageKey),
              link: link ? { url: link, label: linkLabel(link) } : null,
              body: i.body,
              decision: i.decision,
              previousComment: i.previousComment,
            };
          })}
        />
      ) : (
        <div className="banner done">
          <div>
            <b>You sent this back</b>
            <div className="bsub">
              Reviewed by {a.reviewedBy}
              {a.reviewedAt ? ` on ${fmtDay(a.reviewedAt)}` : ""}. We&apos;ll let you know if anything needs another look.
            </div>
          </div>
        </div>
      )}
    </>
  );
}
