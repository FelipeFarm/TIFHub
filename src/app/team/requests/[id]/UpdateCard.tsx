"use client";

import { useActionState, useState } from "react";
import { updateRequest } from "@/app/actions";
import { FormError, SubmitButton } from "@/components/forms";
import { NEED_ACTIONS, STATUS, type StatusKey } from "@/lib/constants";
import { clientBanner } from "@/lib/sentences";

type Props = {
  request: {
    id: number;
    status: string;
    statusLine: string | null;
    expected: string | null;
    needText: string | null;
    needAction: string | null;
    ownerId: string | null;
  };
  team: { id: string; name: string }[];
  replyByText: string;
};

export function UpdateCard({ request: r, team, replyByText }: Props) {
  const [state, action] = useActionState(updateRequest, undefined);
  const [status, setStatus] = useState(r.status);
  const [ownerId, setOwnerId] = useState(r.ownerId ?? "");
  const [statusLine, setStatusLine] = useState(r.statusLine ?? "");
  const [expected, setExpected] = useState(r.expected ?? "");
  const [needText, setNeedText] = useState(r.needText ?? "");
  const [needAction, setNeedAction] = useState(r.needAction ?? "Upload files");
  const ownerName = team.find((t) => t.id === ownerId)?.name;
  const b = clientBanner({ status, statusLine, expected, needText, needAction, ownerName, replyByText });

  return (
    <form className="card" action={action}>
      <input type="hidden" name="requestId" value={r.id} />
      <input type="hidden" name="status" value={status} />
      <h2>Update the client</h2>
      <label className="lbl">Status</label>
      <div className="stseg">
        {(Object.keys(STATUS) as StatusKey[]).map((k) => (
          <button
            key={k}
            type="button"
            className={`tile ${k === "your_turn" ? "you" : ""} ${status === k ? "on" : ""}`}
            onClick={() => setStatus(k)}
            aria-pressed={status === k}
          >
            {STATUS[k]}
          </button>
        ))}
      </div>

      {status === "in_progress" && (
        <>
          <div className="field">
            <label className="lbl" htmlFor="statusLine">
              What&apos;s happening <span>· client sees this</span>
            </label>
            <input
              className="input"
              id="statusLine"
              name="statusLine"
              maxLength={160}
              placeholder={`e.g. ${ownerName?.split(" ")[0] ?? "Theo"} is updating the page`}
              value={statusLine}
              onChange={(e) => setStatusLine(e.target.value)}
            />
          </div>
          <div className="field">
            <label className="lbl" htmlFor="expected">
              Expected <span>· optional</span>
            </label>
            <input className="input" id="expected" name="expected" type="date" value={expected} onChange={(e) => setExpected(e.target.value)} />
          </div>
        </>
      )}
      {status !== "in_progress" && (
        <>
          <input type="hidden" name="statusLine" value={statusLine} />
          <input type="hidden" name="expected" value={expected} />
        </>
      )}
      {status === "your_turn" ? (
        <>
          <div className="field">
            <label className="lbl" htmlFor="needText">
              What do you need from them?
            </label>
            <input
              className="input"
              id="needText"
              name="needText"
              maxLength={300}
              required
              placeholder="e.g. 2–3 photos of recent jobs"
              value={needText}
              onChange={(e) => setNeedText(e.target.value)}
            />
          </div>
          <div className="field">
            <label className="lbl" htmlFor="needAction">
              Button they&apos;ll see
            </label>
            <select className="input" id="needAction" name="needAction" value={needAction} onChange={(e) => setNeedAction(e.target.value)}>
              {NEED_ACTIONS.map((a) => (
                <option key={a}>{a}</option>
              ))}
            </select>
          </div>
        </>
      ) : (
        <>
          <input type="hidden" name="needText" value={needText} />
          <input type="hidden" name="needAction" value={needAction} />
        </>
      )}

      <div className="field">
        <label className="lbl" htmlFor="ownerId">
          Owner
        </label>
        <select className="input" id="ownerId" name="ownerId" value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
          <option value="">Unassigned</option>
          {team.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>

      <div className="preview">
        <span className="muted" style={{ fontSize: 12 }}>
          Client will see:
        </span>
        <div className={`banner ${b.tone}`}>
          <div>
            <b>{b.title}</b>
            {b.sub && <div className="bsub">{b.sub}</div>}
          </div>
          {b.action && <span className="btn sm">{b.action}</span>}
        </div>
      </div>
      <label className="check-row">
        <input type="checkbox" name="notify" defaultChecked /> Email the client about this (via GHL)
      </label>
      <FormError state={state} />
      <SubmitButton className="btn block" pendingText="Saving…">
        Save update
      </SubmitButton>
    </form>
  );
}
