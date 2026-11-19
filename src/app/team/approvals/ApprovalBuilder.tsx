"use client";

import { useActionState, useRef, useState } from "react";
import { sendApproval } from "@/app/actions";
import { FormError, SubmitButton } from "@/components/forms";

type Item = {
  uid: string;
  name?: string; // file name, if there's a file
  preview?: string; // local preview for images
  key?: string; // set once the upload finished
  status: "none" | "uploading" | "done" | "error";
  error?: string;
  caption: string;
  when: string;
  link: string;
  body: string;
};

const MAX_ITEMS = 60;
const uid = () => Math.random().toString(36).slice(2);
const blank = (): Item => ({ uid: uid(), status: "none", caption: "", when: "", link: "", body: "" });
// "01-intro.png" before "2-promo.png" before "10-tips.png"
const byName = (a: File, b: File) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });

export function ApprovalBuilder({ clients, defaultDue }: { clients: { id: string; name: string }[]; defaultDue: string }) {
  const [state, action] = useActionState(sendApproval, undefined);
  const [kind, setKind] = useState<"posts" | "blog">("posts");
  const [clientId, setClientId] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [dragging, setDragging] = useState(false);
  // Controlled, so an error on send doesn't wipe what was typed (forms reset after a server action).
  const [title, setTitle] = useState("");
  const [due, setDue] = useState(defaultDue);
  const [note, setNote] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  // The picked files, kept so a failed upload can be retried without picking it again.
  const picked = useRef(new Map<string, File>());

  const patch = (id: string, p: Partial<Item>) => setItems((list) => list.map((i) => (i.uid === id ? { ...i, ...p } : i)));
  const uploading = items.some((i) => i.status === "uploading");
  const failed = items.filter((i) => i.status === "error").length;
  const hasFiles = items.some((i) => i.status !== "none");

  async function upload(file: File, id: string) {
    picked.current.set(id, file);
    patch(id, { status: "uploading", error: undefined });
    const fd = new FormData();
    fd.append("clientId", clientId);
    fd.append("file", file);
    try {
      const res = await fetch("upload", { method: "POST", body: fd });
      const data = (await res.json().catch(() => ({}))) as { key?: string; error?: string };
      if (!data.key)
        throw new Error(
          data.error ||
            (res.status === 401 ? "You were signed out. Sign in again and re-add the file." : res.status === 413 ? "That file is too big." : `Upload failed (error ${res.status}). Try again, or tell Felipe.`),
        );
      patch(id, { status: "done", key: data.key });
    } catch (e) {
      patch(id, { status: "error", error: (e as Error).message });
    }
  }

  /** Adds files as items (one per file) and uploads them 3 at a time. */
  async function addFiles(list: FileList | File[]) {
    if (!clientId) return alertPick();
    const files = [...list].sort(byName).slice(0, MAX_ITEMS - items.length);
    const fresh = files.map((f) => ({
      ...blank(),
      name: f.name,
      status: "uploading" as const,
      preview: f.type.startsWith("image/") ? URL.createObjectURL(f) : undefined,
    }));
    setItems((cur) => [...cur, ...fresh]);
    const queue = files.map((f, n) => () => upload(f, fresh[n].uid));
    const workers = Array.from({ length: 3 }, async () => {
      for (let job = queue.shift(); job; job = queue.shift()) await job();
    });
    await Promise.all(workers);
  }

  async function setItemFile(id: string, file: File | undefined) {
    if (!file) return;
    if (!clientId) return alertPick();
    patch(id, { name: file.name, status: "uploading", preview: file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined });
    await upload(file, id);
  }

  const [pickWarn, setPickWarn] = useState(false);
  const alertPick = () => setPickWarn(true);
  const move = (i: number, by: number) =>
    setItems((list) => {
      const next = [...list];
      const [x] = next.splice(i, 1);
      next.splice(Math.max(0, Math.min(next.length, i + by)), 0, x);
      return next;
    });

  // What the server gets: only what it needs, never the local previews.
  const payload = JSON.stringify(
    items.map((i) => ({ key: i.key ?? null, caption: i.caption, when: i.when, link: i.link, body: i.body })),
  );

  return (
    <form className="card" action={action}>
      <h2>Send for approval</h2>
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="items" value={payload} />
      <input type="hidden" name="service" value={kind === "blog" ? "seo" : "social"} />

      <div className="filters" role="tablist" style={{ marginBottom: 12 }}>
        {(["posts", "blog"] as const).map((k) => (
          <button
            key={k}
            type="button"
            className={kind === k ? "on" : ""}
            onClick={() => {
              if (k !== kind && items.length && !confirmSwitch()) return;
              setKind(k);
              setItems([]);
            }}
          >
            {k === "posts" ? "Social posts & videos" : "Blog articles"}
          </button>
        ))}
      </div>

      <div className="field">
        <label className="lbl" htmlFor="ab-client">Client</label>
        <select
          className="input"
          id="ab-client"
          name="clientId"
          required
          value={clientId}
          disabled={hasFiles}
          onChange={(e) => {
            setClientId(e.target.value);
            setPickWarn(false);
          }}
        >
          <option value="" disabled>
            Pick a client…
          </option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        {/* A disabled select isn't sent with the form, so send the value separately. */}
        {hasFiles && <input type="hidden" name="clientId" value={clientId} />}
        {hasFiles && <small className="muted">Files are already uploaded for this client. Remove them to change client.</small>}
        {pickWarn && !clientId && <small style={{ color: "var(--warn)" }}>Pick the client first, so the files are stored for them.</small>}
      </div>
      <div className="field">
        <label className="lbl" htmlFor="ab-title">What is it?</label>
        <input className="input" id="ab-title" name="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={kind === "blog" ? "December blog articles" : "December social posts"} required />
      </div>

      {kind === "posts" ? (
        <>
          <label className="lbl">Posts</label>
          <div
            className={`drop ${dragging ? "over" : ""}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              addFiles(e.dataTransfer.files);
            }}
            onClick={() => fileInput.current?.click()}
            role="button"
            tabIndex={0}
          >
            <b>Drop the whole month here</b>
            <span className="muted"> or click to pick files · images or PDFs, up to 25 MB each · sorted by file name</span>
          </div>
          <input
            ref={fileInput}
            type="file"
            multiple
            accept="image/*,.pdf"
            hidden
            onChange={(e) => {
              if (e.target.files) addFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <button type="button" className="btn ghost sm" style={{ margin: "8px 0 12px" }} onClick={() => setItems((l) => [...l, blank()])}>
            + Add a video or link (no file)
          </button>
        </>
      ) : (
        <>
          <label className="lbl">Articles</label>
          <button type="button" className="btn ghost sm" style={{ marginBottom: 12 }} onClick={() => setItems((l) => [...l, blank()])}>
            + Add an article
          </button>
        </>
      )}

      {items.map((it, n) => (
        <div className="itemrow" key={it.uid}>
          <div className="row between" style={{ gap: 8 }}>
            <b style={{ fontSize: 13 }}>
              {kind === "blog" ? "Article" : "Item"} {n + 1}
              {it.name ? <span className="muted"> · {it.name}</span> : null}
            </b>
            <span className="row" style={{ gap: 4 }}>
              <button type="button" className="linkbtn" onClick={() => move(n, -1)} disabled={n === 0} aria-label="Move up">↑</button>
              <button type="button" className="linkbtn" onClick={() => move(n, 1)} disabled={n === items.length - 1} aria-label="Move down">↓</button>
              <button type="button" className="linkbtn" onClick={() => setItems((l) => l.filter((x) => x.uid !== it.uid))}>Remove</button>
            </span>
          </div>
          {it.status !== "none" && (
            <div className="row" style={{ gap: 10, marginTop: 6 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {it.preview ? <img src={it.preview} alt="" className="thumb-sm" /> : <span className="thumb-sm doc">PDF</span>}
              <small className={it.status === "error" ? "err-text" : "muted"}>
                {it.status === "uploading" ? "Uploading…" : it.status === "done" ? "Uploaded ✓" : it.error}
              </small>
              {it.status === "error" && picked.current.get(it.uid) && (
                <button type="button" className="btn sm ghost" onClick={() => upload(picked.current.get(it.uid)!, it.uid)}>
                  Try again
                </button>
              )}
            </div>
          )}
          {kind === "blog" ? (
            <>
              <input className="input" placeholder="Article title" value={it.caption} onChange={(e) => patch(it.uid, { caption: e.target.value })} maxLength={200} />
              <textarea
                className="input"
                placeholder="Paste the article here. Leave a blank line between paragraphs; start a line with ## for a subheading."
                value={it.body}
                onChange={(e) => patch(it.uid, { body: e.target.value })}
                rows={8}
              />
              <input className="input" placeholder="Google Doc link (optional)" value={it.link} onChange={(e) => patch(it.uid, { link: e.target.value })} />
              {it.status === "none" && (
                <label className="muted" style={{ display: "block", fontSize: 13, marginTop: 6 }}>
                  Featured image or PDF (optional):{" "}
                  <input type="file" accept="image/*,.pdf" onChange={(e) => setItemFile(it.uid, e.target.files?.[0])} />
                </label>
              )}
            </>
          ) : (
            <>
              <textarea className="input" placeholder="Caption" value={it.caption} onChange={(e) => patch(it.uid, { caption: e.target.value })} rows={2} style={{ minHeight: 0 }} />
              <input className="input" placeholder="When / where, e.g. Mon, Dec 1 · Instagram" value={it.when} onChange={(e) => patch(it.uid, { when: e.target.value })} maxLength={80} />
              <input className="input" placeholder="Video or link to review (optional), e.g. a Google Drive or Vimeo link" value={it.link} onChange={(e) => patch(it.uid, { link: e.target.value })} />
            </>
          )}
        </div>
      ))}

      <div className="field" style={{ marginTop: 6 }}>
        <label className="lbl" htmlFor="ab-due">Approve by</label>
        <input className="input" id="ab-due" name="due" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
      </div>
      <div className="field">
        <label className="lbl" htmlFor="ab-note">
          Note to client <span>optional</span>
        </label>
        <textarea className="input" id="ab-note" name="note" rows={3} style={{ minHeight: 0 }} value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      <FormError state={state} />
      {uploading && <p className="muted">Waiting for uploads to finish…</p>}
      {failed > 0 && !uploading && <p className="err-text">{failed} file{failed > 1 ? "s" : ""} didn&apos;t upload. Remove {failed > 1 ? "them" : "it"} or try again.</p>}
      <SubmitButton className="btn block" disabled={uploading || failed > 0 || !items.length}>
        Send {items.length ? `${items.length} ${kind === "blog" ? "article" : "item"}${items.length > 1 ? "s" : ""}` : ""} to client
      </SubmitButton>
    </form>
  );
}

function confirmSwitch() {
  return window.confirm("Switching type clears the items you've added. Continue?");
}
