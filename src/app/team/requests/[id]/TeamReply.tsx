"use client";

import { useActionState, useState } from "react";
import { teamReply } from "@/app/actions";
import { FormError, SubmitButton } from "@/components/forms";

export function TeamReply({ requestId }: { requestId: number }) {
  const [state, action] = useActionState(teamReply, undefined);
  const [internal, setInternal] = useState(false);
  return (
    <form action={action}>
      <input type="hidden" name="requestId" value={requestId} />
      <input type="hidden" name="internal" value={internal ? "1" : "0"} />
      <div className={`composer ${internal ? "internal" : ""}`}>
        <textarea
          name="body"
          aria-label={internal ? "Internal note" : "Reply to client"}
          placeholder={internal ? "Internal note. The client won't see this." : "Reply to the client…"}
        />
        <div className="bar">
          <div className="tabs" role="tablist">
            <button type="button" className={internal ? "" : "on"} onClick={() => setInternal(false)}>
              Reply to client
            </button>
            <button type="button" className={`int ${internal ? "on" : ""}`} onClick={() => setInternal(true)}>
              Internal note
            </button>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <input type="file" name="files" multiple aria-label="Attach files" />
            <SubmitButton className="btn sm">{internal ? "Save note" : "Send"}</SubmitButton>
          </div>
        </div>
      </div>
      <div style={{ marginTop: 10 }}>
        <FormError state={state} />
      </div>
    </form>
  );
}
