"use client";

import { useActionState, useEffect, useState } from "react";
import { submitReview } from "@/app/actions";
import { FormError, SubmitButton } from "@/components/forms";

type Item = {
  id: number;
  caption: string;
  when: string | null;
  file: { url: string; kind: "image" | "pdf" | "other"; name: string } | null;
  link: { url: string; label: string } | null;
  body: string | null;
  decision: string;
  previousComment: string | null;
};

/** Full-size view of an image, on top of the page. Esc or the × closes it. */
function Lightbox({ src, onClose }: { src: string; onClose: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", k);
      document.body.style.overflow = "";
    };
  }, [onClose]);
  return (
    <div className="lightbox" role="dialog" aria-modal="true" aria-label="Full size" onClick={onClose}>
      <div className="lb-bar" onClick={(e) => e.stopPropagation()}>
        <a href={src} target="_blank" rel="noopener noreferrer" className="btn sm ghost">
          Open in new tab ↗
        </a>
        <button type="button" className="btn sm" onClick={onClose} aria-label="Close">
          ✕ Close
        </button>
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" onClick={(e) => e.stopPropagation()} />
    </div>
  );
}

function Media({ item, onZoom }: { item: Item; onZoom: (src: string) => void }) {
  const f = item.file;
  if (f?.kind === "image")
    return (
      <button type="button" className="img zoomable" onClick={() => onZoom(f.url)} aria-label="View full size">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={f.url} alt="" />
        <span className="zoom">⤢ View full size</span>
      </button>
    );
  if (f)
    return (
      <div className="img doc">
        <span className="doc-ic">{f.kind === "pdf" ? "PDF" : "FILE"}</span>
        <a className="btn sm ghost" href={f.url} target="_blank" rel="noopener noreferrer">
          {f.kind === "pdf" ? "Open PDF ↗" : `Download ${f.name}`}
        </a>
      </div>
    );
  if (item.link)
    return (
      <div className="img doc">
        <span className="doc-ic">▶</span>
        <a className="btn sm" href={item.link.url} target="_blank" rel="noopener noreferrer">
          {item.link.label} ↗
        </a>
      </div>
    );
  return null;
}

function Article({ body }: { body: string }) {
  const [open, setOpen] = useState(false);
  const paras = body.split(/\n{2,}|\r\n\r\n/).map((p) => p.trim()).filter(Boolean);
  const words = body.trim().split(/\s+/).length;
  const shown = open ? paras : paras.slice(0, 2);
  return (
    <div className="article">
      <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>
        About {Math.max(1, Math.round(words / 230))} min read · {words.toLocaleString()} words
      </div>
      {shown.map((p, i) => {
        const h = p.match(/^#{1,3}\s+(.*)$/);
        return h ? <h3 key={i}>{h[1]}</h3> : <p key={i}>{p}</p>;
      })}
      {paras.length > 2 && (
        <button type="button" className="linkbtn" onClick={() => setOpen(!open)}>
          {open ? "Show less" : "Read the full article"}
        </button>
      )}
    </div>
  );
}

export function ReviewForm({
  approvalId, items, due, defaultName, kind,
}: {
  approvalId: number;
  items: Item[];
  due: string | null;
  defaultName: string;
  kind: "posts" | "blog";
}) {
  const [state, action] = useActionState(submitReview, undefined);
  const pending = items.filter((i) => i.decision === "pending");
  const [decisions, setDecisions] = useState<Record<number, "approved" | "changes">>({});
  const [comments, setComments] = useState<Record<number, string>>({});
  const [zoom, setZoom] = useState<string | null>(null);
  const reviewed = pending.filter((i) => decisions[i.id]).length;
  const missingComment = pending.some((i) => decisions[i.id] === "changes" && !comments[i.id]?.trim());
  const ready = reviewed === pending.length && !missingComment;
  const blog = kind === "blog";

  return (
    <form action={action}>
      <input type="hidden" name="approvalId" value={approvalId} />
      <p className="sub" style={{ marginBottom: 6 }}>
        {blog ? (
          <>Read each article, then tap <b>✓ Looks good</b> or <b>✎ Change</b> and tell us what to change.</>
        ) : (
          <>Tap <b>✓ Looks good</b> for the ones you like and <b>✎ Change</b> for anything you&apos;d change. Tap an image to see it full size.</>
        )}
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

      <div className={blog ? "posts blogs" : "posts"}>
        {items.map((i) => {
          const d = i.decision === "pending" ? decisions[i.id] : undefined;
          return (
            <div key={i.id} className={`post ${d === "approved" || i.decision === "approved" ? "ok" : d === "changes" ? "chg" : ""}`}>
              {!blog && <Media item={i} onZoom={setZoom} />}
              <div className="pb">
                {i.when && <small>{i.when}</small>}
                {blog ? <h2 style={{ margin: "0 0 8px" }}>{i.caption}</h2> : <p className="caption">{i.caption}</p>}
                {blog && i.file?.kind === "image" && (
                  <button type="button" className="img zoomable blogimg" onClick={() => setZoom(i.file!.url)} aria-label="View full size">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={i.file.url} alt="" />
                  </button>
                )}
                {blog && i.body && <Article body={i.body} />}
                {/* Posts show their file or link up top; extra buttons only when there's both, or for blogs. */}
                {((i.link && (blog || i.file)) || (blog && i.file && i.file.kind !== "image")) && (
                  <div className="row" style={{ gap: 8, margin: "0 0 10px" }}>
                    {i.link && (blog || i.file) && (
                      <a className="btn sm ghost" href={i.link.url} target="_blank" rel="noopener noreferrer">
                        {i.link.label} ↗
                      </a>
                    )}
                    {blog && i.file && i.file.kind !== "image" && (
                      <a className="btn sm ghost" href={i.file.url} target="_blank" rel="noopener noreferrer">
                        {i.file.kind === "pdf" ? "Open PDF ↗" : `Download ${i.file.name}`}
                      </a>
                    )}
                  </div>
                )}
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
                        placeholder={blog ? "What should we change? Quote the sentence if it helps." : "What should we change?"}
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
      {zoom && <Lightbox src={zoom} onClose={() => setZoom(null)} />}
    </form>
  );
}
