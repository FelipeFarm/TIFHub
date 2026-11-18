"use client";

import { useActionState, useState } from "react";
import { createRequest } from "@/app/actions";
import { FormError, SubmitButton } from "@/components/forms";
import { SERVICES, SERVICE_KEYS, URGENCY, type ServiceKey, type UrgencyKey } from "@/lib/constants";

export function NewRequestForm({ defaultName, teamNames }: { defaultName: string; teamNames: string }) {
  const [state, action] = useActionState(createRequest, undefined);
  const [service, setService] = useState<ServiceKey>("web");
  const [type, setType] = useState("content");
  const [urgency, setUrgency] = useState<UrgencyKey>("no_rush");
  const svc = SERVICES[service];
  let n = 1;

  return (
    <form action={action}>
      <input type="hidden" name="service" value={service} />
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="urgency" value={urgency} />

      <div className="q">
        <div className="qh">
          <span className="qnum">{n++}</span>What&apos;s it about?
        </div>
        <div className="tiles" role="radiogroup" aria-label="What's it about?">
          {SERVICE_KEYS.map((k) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={service === k}
              className={`tile ${service === k ? "on" : ""}`}
              onClick={() => {
                setService(k);
                setType(SERVICES[k].types[0]?.[0] ?? "");
              }}
            >
              <b>{SERVICES[k].label}</b>
              <small>{SERVICES[k].hint}</small>
            </button>
          ))}
        </div>
      </div>

      {svc.question && (
        <div className="q">
          <div className="qh">
            <span className="qnum">{n++}</span>
            {svc.question}
          </div>
          <div className="tiles four" role="radiogroup" aria-label={svc.question}>
            {svc.types.map(([k, label, hint]) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={type === k}
                className={`tile ${type === k ? "on" : ""}`}
                onClick={() => setType(k)}
              >
                <b>{label}</b>
                {hint && service !== "web" && <small>{hint}</small>}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="q">
        <div className="qh">
          <span className="qnum">{n++}</span>Tell us about it
        </div>
        {service === "web" && (
          <div className="field">
            <label className="lbl" htmlFor="pageUrl">
              Which page? <span>Paste the link if you have it</span>
            </label>
            <input className="input" id="pageUrl" name="pageUrl" placeholder="e.g. yoursite.com/services" />
          </div>
        )}
        <label className="lbl" htmlFor="details">
          What should we do?
        </label>
        <textarea
          className="input"
          id="details"
          name="details"
          required
          placeholder="Write it like you'd say it to us on the phone."
        />
        <label className="drop" style={{ marginTop: 12 }}>
          📎 Add photos or files <span className="muted">(optional, up to 25 MB each)</span>
          <input type="file" name="files" multiple accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.zip,.txt" />
        </label>
      </div>

      <div className="q">
        <div className="qh">
          <span className="qnum">{n++}</span>How soon do you need it?
        </div>
        <div className="tiles" role="radiogroup" aria-label="How soon">
          {(Object.keys(URGENCY) as UrgencyKey[]).map((k) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={urgency === k}
              className={`tile ${urgency === k ? "on" : ""}`}
              onClick={() => setUrgency(k)}
            >
              <b>{URGENCY[k].label}</b>
              <small>{URGENCY[k].hint}</small>
            </button>
          ))}
        </div>
      </div>

      <div className="q">
        <div className="qh">
          <span className="qnum">{n++}</span>Your name
        </div>
        <input className="input" name="askedBy" defaultValue={defaultName} required style={{ maxWidth: 320 }} autoComplete="name" />
        <p className="muted" style={{ margin: "6px 0 0" }}>
          So we know who to follow up with. We&apos;ll remember it on this device.
        </p>
      </div>

      <FormError state={state} />
      <div className="submitbar">
        <span className="muted">{teamNames} will get this right away.</span>
        <SubmitButton className="btn big">Send request</SubmitButton>
      </div>
    </form>
  );
}
