"use client";

import { useActionState, useState } from "react";
import { sendApproval } from "@/app/actions";
import { FormError, SubmitButton } from "@/components/forms";

export function ApprovalBuilder({ clients, defaultDue }: { clients: { id: string; name: string }[]; defaultDue: string }) {
  const [state, action] = useActionState(sendApproval, undefined);
  const [count, setCount] = useState(3);
  return (
    <form className="card" action={action}>
      <h2>Send for approval</h2>
      <input type="hidden" name="count" value={count} />
      <div className="field">
        <label className="lbl" htmlFor="ab-client">Client</label>
        <select className="input" id="ab-client" name="clientId" required defaultValue="">
          <option value="" disabled>
            Pick a client…
          </option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label className="lbl" htmlFor="ab-title">What is it?</label>
        <input className="input" id="ab-title" name="title" placeholder="December social posts" required />
      </div>
      <input type="hidden" name="service" value="social" />
      <label className="lbl">Items</label>
      {Array.from({ length: count }, (_, i) => (
        <div className="itemrow" key={i}>
          <input type="file" name={`file_${i}`} accept="image/*,.pdf" aria-label={`Item ${i + 1} image`} />
          <textarea className="input" name={`caption_${i}`} placeholder={`Item ${i + 1} caption`} rows={2} style={{ minHeight: 0 }} />
          <input className="input" name={`when_${i}`} placeholder="When / where, e.g. Mon, Dec 1 · Facebook" />
        </div>
      ))}
      <button type="button" className="btn ghost sm" onClick={() => setCount((c) => Math.min(c + 1, 40))} style={{ marginBottom: 14 }}>
        + Add item
      </button>
      <div className="field">
        <label className="lbl" htmlFor="ab-due">Approve by</label>
        <input className="input" id="ab-due" name="due" type="date" defaultValue={defaultDue} />
      </div>
      <div className="field">
        <label className="lbl" htmlFor="ab-note">
          Note to client <span>optional</span>
        </label>
        <textarea className="input" id="ab-note" name="note" rows={3} style={{ minHeight: 0 }} />
      </div>
      <FormError state={state} />
      <SubmitButton className="btn block">Send to client</SubmitButton>
    </form>
  );
}
