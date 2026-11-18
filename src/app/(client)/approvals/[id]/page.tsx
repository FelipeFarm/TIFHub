import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { approvalItems, approvals } from "@/db/schema";
import { rememberedName, requireClient } from "@/lib/auth";
import { fileUrl } from "@/lib/files";
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
          items={items.map((i) => ({
            id: i.id,
            caption: i.caption,
            when: i.whenLabel,
            image: i.imageKey ? fileUrl(i.imageKey) : null,
            decision: i.decision,
            previousComment: i.previousComment,
          }))}
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
