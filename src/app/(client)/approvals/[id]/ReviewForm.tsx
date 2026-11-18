"use client";

import { useActionState, useState } from "react";
import { submitReview } from "@/app/actions";
import { FormError, SubmitButton } from "@/components/forms";

type Item = {
  id: number;
  caption: string;
  when: string | null;
  image: string | null;
  decision: string;
  previousComment: string | null;
};

export function ReviewForm({ approvalId, items, due, defaultName }: { approvalId: number; items: Item[]; due: string | null; defaultName: string }) {
  const [state, action] = useActionState(submitReview, undefined);
  const pending = items.filter((i) => i.decision === "pending");
  const [decisions, setDecisions] = useState<Record<number, "approved" | "changes">>({});
  const [comments, setComments] = useState<Record<number, string>>({});
  const reviewed = pending.filter((i) => decisions[i.id]).length;
  const missingComment = pending.some((i) => decisions[i.id] === "changes" && !comments[i.id]?.trim());
  const ready = reviewed === pending.length && !missingComment;

  return (
    <form action={action}>
      <input type="hidden" name="approvalId" value={approvalId} />
      <p className="sub" style={{ marginBottom: 6 }}>
        Tap <b>✓ Looks good</b> for the ones you like and <b>✎ Change</b> for anything you&apos;d change.
      </p>
      <div className="row between muted">
        <span>
          {reviewed} of {pending.length} reviewed
        </span>
        {due && <span>Reply by {due}</span>}
      </div>
      <div className="progress">
        <i style={{ width: `${pending.length ? (reviewed / pending.length) * 100 : 100}%` }} />
      </div>

      <div className="posts">
        {items.map((i) => {
          const d = i.decision === "pending" ? decisions[i.id] : undefined;
          return (
            <div key={i.id} className={`post ${d === "approved" || i.decision === "approved" ? "ok" : d === "changes" ? "chg" : ""}`}>
              <div className="img">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {i.image ? <img src={i.image} alt="" /> : "No image"}
              </div>
              <div className="pb">
                {i.when && <small>{i.when}</small>}
                <p>{i.caption}</p>
                {i.decision !== "pending" ? (
                  <div className="locked">✓ Already approved</div>
                ) : (
                  <>
                    {i.previousComment && <p className="prev">Updated after your note: “{i.previousComment}”</p>}
                    <input type="hidden" name={`d_${i.id}`} value={d ?? ""} />
                    <div className="acts">
                      <button type="button" className="btn ghost sm yes" onClick={() => setDecisions({ ...decisions, [i.id]: "approved" })}>
                        ✓ Looks good
                      </button>
                      <button type="button" className="btn ghost sm no" onClick={() => setDecisions({ ...decisions, [i.id]: "changes" })}>
                        ✎ Change
                      </button>
                    </div>
                    {d === "changes" && (
                      <textarea
                        className="input why"
                        name={`c_${i.id}`}
                        autoFocus
                        placeholder="What should we change?"
                        value={comments[i.id] ?? ""}
                        onChange={(e) => setComments({ ...comments, [i.id]: e.target.value })}
                      />
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="stickybar">
        <button
          type="button"
          className="btn ghost"
          onClick={() => setDecisions(Object.fromEntries(pending.map((i) => [i.id, "approved"])))}
        >
          Approve everything
        </button>
        <div className="row" style={{ gap: 8 }}>
          <input className="input" name="name" defaultValue={defaultName} placeholder="Your name" required style={{ width: 170, padding: "9px 10px" }} aria-label="Your name" />
          <SubmitButton disabled={!ready}>Send my review</SubmitButton>
        </div>
      </div>
      <FormError state={state} />
      {!ready && reviewed > 0 && missingComment && <p className="muted">Add a note on each item you want changed.</p>}
    </form>
  );
}
