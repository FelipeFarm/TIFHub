"use client";

import { useActionState, useState } from "react";
import { logRequest } from "@/app/actions";
import { FormError, SubmitButton } from "@/components/forms";
import { SERVICES, SERVICE_KEYS, URGENCY } from "@/lib/constants";

const CHANNELS = [
  ["email", "Email"],
  ["phone", "Phone"],
  ["text", "Text"],
  ["meeting", "Meeting"],
] as const;

export function LogForm({
  me, clients, team,
}: {
  me: string;
  clients: { id: string; name: string; leadId: string | null }[];
  team: { id: string; name: string }[];
}) {
  const [state, action] = useActionState(logRequest, undefined);
  const [channel, setChannel] = useState<string>("email");
  const [clientId, setClientId] = useState("");
  const [ownerId, setOwnerId] = useState(me);
  const [askedBy, setAskedBy] = useState("");

  return (
    <form className="card" action={action}>
      <input type="hidden" name="channel" value={channel} />
      <div className="row" style={{ gap: 14, alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 200 }} className="field">
          <label className="lbl" htmlFor="lg-client">Client</label>
          <select
            className="input"
            id="lg-client"
            name="clientId"
            required
            value={clientId}
            onChange={(e) => {
              setClientId(e.target.value);
              const lead = clients.find((c) => c.id === e.target.value)?.leadId;
              if (lead) setOwnerId(lead);
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
        </div>
        <div style={{ flex: 1, minWidth: 200 }} className="field">
          <label className="lbl" htmlFor="lg-who">Who asked?</label>
          <input className="input" id="lg-who" name="askedBy" required value={askedBy} onChange={(e) => setAskedBy(e.target.value)} placeholder="e.g. Chris (office manager)" />
        </div>
      </div>

      <label className="lbl">How did it come in?</label>
      <div className="filters">
        {CHANNELS.map(([k, label]) => (
          <button key={k} type="button" className={channel === k ? "on" : ""} onClick={() => setChannel(k)}>
            {label}
          </button>
        ))}
      </div>

      <div className="field">
        <label className="lbl" htmlFor="lg-details">
          What they asked <span>· paste the email or summarize the call</span>
        </label>
        <textarea className="input" id="lg-details" name="details" required />
      </div>
      <div className="field">
        <label className="lbl" htmlFor="lg-title">
          Short title <span>· optional, we&apos;ll use the first line otherwise</span>
        </label>
        <input className="input" id="lg-title" name="title" maxLength={120} />
      </div>

      <div className="row" style={{ gap: 14, alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 150 }} className="field">
          <label className="lbl" htmlFor="lg-svc">Service</label>
          <select className="input" id="lg-svc" name="service" defaultValue="web">
            {SERVICE_KEYS.map((k) => (
              <option key={k} value={k}>
                {SERVICES[k].label}
              </option>
            ))}
          </select>
        </div>
        <div style={{ flex: 1, minWidth: 150 }} className="field">
          <label className="lbl" htmlFor="lg-urg">How soon</label>
          <select className="input" id="lg-urg" name="urgency" defaultValue="no_rush">
            {Object.entries(URGENCY).map(([k, u]) => (
              <option key={k} value={k}>
                {u.label} ({u.hint.toLowerCase()})
              </option>
            ))}
          </select>
        </div>
        <div style={{ flex: 1, minWidth: 150 }} className="field">
          <label className="lbl" htmlFor="lg-owner">Owner</label>
          <select className="input" id="lg-owner" name="ownerId" value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
            {team.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <label className="check-row">
        <input type="checkbox" name="notify" defaultChecked />
        <span>
          Tell the client it&apos;s in their Hub
          <span className="muted" style={{ display: "block" }}>
            Sends: “Got it{askedBy ? `, ${askedBy.split(" ")[0]}` : ""}! We&apos;ve added this to your Client Hub so you can follow along: [link]”
          </span>
        </span>
      </label>
      <FormError state={state} />
      <SubmitButton>Add to Hub</SubmitButton>
    </form>
  );
}
