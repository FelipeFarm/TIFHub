"use client";

import { useActionState } from "react";
import { clientReply } from "@/app/actions";
import { FormError, SubmitButton } from "@/components/forms";

export function ClientReply({ requestId, defaultName, highlight }: { requestId: number; defaultName: string; highlight: boolean }) {
  const [state, action] = useActionState(clientReply, undefined);
  return (
    <form action={action} id="reply" style={{ scrollMarginTop: 20 }}>
      <input type="hidden" name="requestId" value={requestId} />
      <div className="composer" style={highlight ? { borderColor: "var(--warn)" } : undefined}>
        <textarea name="body" placeholder={highlight ? "Reply or attach what we asked for…" : "Write a reply…"} aria-label="Reply" />
        <div className="bar">
          <input type="file" name="files" multiple accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.zip,.txt" aria-label="Attach files" />
          <div className="row" style={{ gap: 8 }}>
            <input className="who" name="name" defaultValue={defaultName} placeholder="Your name" aria-label="Your name" required />
            <SubmitButton className="btn sm">Send</SubmitButton>
          </div>
        </div>
      </div>
      <div style={{ marginTop: 10 }}>
        <FormError state={state} />
      </div>
    </form>
  );
}
