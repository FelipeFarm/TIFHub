"use client";

import { useActionState, useState } from "react";
import { makeResetLink, saveClient, saveClientEmails, saveTeamMember, type AdminState } from "@/app/admin-actions";
import { FormError, SubmitButton } from "@/components/forms";

/** A one-time sign-in link, shown once right after it's made. */
function LinkBox({ state }: { state: AdminState }) {
  const [copied, setCopied] = useState(false);
  if (!state?.link) return state?.ok ? <div className="alert ok">{state.ok}</div> : null;
  return (
    <div className="alert ok" style={{ display: "block" }}>
      <p style={{ margin: "0 0 8px" }}>{state.ok}</p>
      <div className="row" style={{ gap: 8 }}>
        <input className="input mono" readOnly value={state.link} aria-label={`Sign-in link for ${state.linkFor}`} onFocus={(e) => e.target.select()} />
        <button
          type="button"
          className="btn sm"
          onClick={async () => {
            await navigator.clipboard.writeText(state.link!);
            setCopied(true);
          }}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <p className="muted" style={{ margin: "8px 0 0", fontSize: 13 }}>
        Works once, until {state.linkExpires}. This is the only time it&apos;s shown. Send it straight to {state.linkFor}{" "}
        (text, or read it out on a call). Don&apos;t post it in a shared channel.
      </p>
    </div>
  );
}

type Person = { id: string; name: string };
type MondayUser = { id: string; name: string; email: string };

export function ClientForm({
  team, client,
}: {
  team: Person[];
  client?: { id: string; name: string; loginEmail: string; leadId: string | null; backupId: string | null };
}) {
  const [state, action] = useActionState(saveClient, undefined);
  return (
    <form action={action} className="stack" style={{ gap: 10 }}>
      <FormError state={state} />
      <LinkBox state={state} />
      {client && <input type="hidden" name="id" value={client.id} />}
      <div className="field">
        <label className="lbl" htmlFor={`cn-${client?.id ?? "new"}`}>Company name</label>
        <input className="input" id={`cn-${client?.id ?? "new"}`} name="name" defaultValue={client?.name} required maxLength={120} />
      </div>
      <div className="field">
        <label className="lbl" htmlFor={`ce-${client?.id ?? "new"}`}>Sign-in email (shared by the company)</label>
        <input className="input" id={`ce-${client?.id ?? "new"}`} name="loginEmail" type="email" defaultValue={client?.loginEmail} required placeholder="e.g. office@theircompany.com" />
      </div>
      <div className="row" style={{ gap: 10 }}>
        <div className="field" style={{ flex: 1 }}>
          <label className="lbl" htmlFor={`cl-${client?.id ?? "new"}`}>Account lead</label>
          <select className="input" id={`cl-${client?.id ?? "new"}`} name="leadId" defaultValue={client?.leadId ?? ""}>
            <option value="">Not set</option>
            {team.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label className="lbl" htmlFor={`cb-${client?.id ?? "new"}`}>Backup</label>
          <select className="input" id={`cb-${client?.id ?? "new"}`} name="backupId" defaultValue={client?.backupId ?? ""}>
            <option value="">Not set</option>
            {team.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <SubmitButton className="btn" pendingText="Saving…">
          {client ? "Save changes" : "Add client and make welcome link"}
        </SubmitButton>
      </div>
    </form>
  );
}

export function TeamForm({
  member, mondayUsers, isSelf,
}: {
  member?: { id: string; name: string; email: string; role: string; mondayUserId: string | null; slackUserId: string | null };
  mondayUsers: MondayUser[];
  isSelf?: boolean;
}) {
  const [state, action] = useActionState(saveTeamMember, undefined);
  const [name, setName] = useState(member?.name ?? "");
  const [email, setEmail] = useState(member?.email ?? "");
  const [mondayUserId, setMondayUserId] = useState(member?.mondayUserId ?? "");
  const k = member?.id ?? "new";
  return (
    <form action={action} className="stack" style={{ gap: 10 }}>
      <FormError state={state} />
      <LinkBox state={state} />
      {member && <input type="hidden" name="id" value={member.id} />}
      {mondayUsers.length > 0 && (
        <div className="field">
          <label className="lbl" htmlFor={`tm-${k}`}>monday account</label>
          <select
            className="input"
            id={`tm-${k}`}
            name="mondayUserId"
            value={mondayUserId}
            onChange={(e) => {
              setMondayUserId(e.target.value);
              const u = mondayUsers.find((x) => x.id === e.target.value);
              if (u && !member) {
                setName(u.name);
                setEmail(u.email.toLowerCase());
              }
            }}
          >
            <option value="">Not linked (Owner won&apos;t be set on monday)</option>
            {mondayUsers.map((u) => (
              <option key={u.id} value={u.id}>{u.name} · {u.email}</option>
            ))}
          </select>
        </div>
      )}
      <div className="row" style={{ gap: 10 }}>
        <div className="field" style={{ flex: 1 }}>
          <label className="lbl" htmlFor={`tn-${k}`}>Name</label>
          <input className="input" id={`tn-${k}`} name="name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} />
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label className="lbl" htmlFor={`te-${k}`}>Work email</label>
          <input className="input" id={`te-${k}`} name="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
      </div>
      <div className="field">
        <label className="lbl" htmlFor={`ts-${k}`}>Slack member ID (for @mentions in alerts)</label>
        <input className="input mono" id={`ts-${k}`} name="slackUserId" defaultValue={member?.slackUserId ?? ""} placeholder="e.g. U04ABC123 · Slack profile → ⋯ → Copy member ID" maxLength={20} />
      </div>
      <div className="field">
        <label className="lbl" htmlFor={`tr-${k}`}>Access</label>
        <select className="input" id={`tr-${k}`} name="role" defaultValue={member?.role ?? "account_lead"} disabled={isSelf}>
          <option value="account_lead">Team: requests, replies and approvals</option>
          <option value="admin">Admin: also adds clients and team, and makes sign-in links</option>
        </select>
        {isSelf && <input type="hidden" name="role" value={member?.role} />}
      </div>
      <div>
        <SubmitButton className="btn" pendingText="Saving…">
          {member ? "Save changes" : "Add and make welcome link"}
        </SubmitButton>
      </div>
    </form>
  );
}

export function LinkButton({ userType, id, waiting }: { userType: "client" | "team"; id: string; waiting: boolean }) {
  const [state, action] = useActionState(makeResetLink, undefined);
  return (
    <form action={action} className="stack" style={{ gap: 8 }}>
      <FormError state={state} />
      <LinkBox state={state} />
      <input type="hidden" name="userType" value={userType} />
      <input type="hidden" name="id" value={id} />
      <div>
        <SubmitButton className="btn sm ghost" pendingText="Making link…">
          {waiting ? "New welcome link" : "Password reset link"}
        </SubmitButton>
      </div>
    </form>
  );
}

export function ClientEmailsForm({ client }: { client: { id: string; name: string; notifyEmail: string | null; emailsOn: boolean } }) {
  const [state, action] = useActionState(saveClientEmails, undefined);
  return (
    <form action={action} className="stack" style={{ gap: 10, borderTop: "1px solid var(--line)", paddingTop: 14 }}>
      <b>Client emails (sent through GHL)</b>
      <FormError state={state} />
      {state?.ok && <div className="alert ok">{state.ok}</div>}
      <input type="hidden" name="id" value={client.id} />
      <div className="field">
        <label className="lbl" htmlFor={`ne-${client.id}`}>GHL contact email (must already exist in GHL)</label>
        <input className="input" id={`ne-${client.id}`} name="notifyEmail" type="email" defaultValue={client.notifyEmail ?? ""} placeholder="e.g. owner@theircompany.com" />
      </div>
      <label className="check-row">
        <input type="checkbox" name="emailsOn" defaultChecked={client.emailsOn} /> Send {client.name} email updates (received, replies, status, approvals)
      </label>
      <div>
        <SubmitButton className="btn sm" pendingText="Checking GHL…">Save email settings</SubmitButton>
      </div>
    </form>
  );
}
