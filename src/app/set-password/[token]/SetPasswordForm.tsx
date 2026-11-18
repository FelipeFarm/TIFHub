"use client";

import { useActionState } from "react";
import { setPassword } from "@/app/admin-actions";
import { FormError, SubmitButton } from "@/components/forms";

export function SetPasswordForm({ token, email }: { token: string; email: string }) {
  const [state, action] = useActionState(setPassword, undefined);
  return (
    <form action={action}>
      <FormError state={state} />
      <input type="hidden" name="token" value={token} />
      {/* Lets password managers save the password under the right email. */}
      <input type="email" name="username" value={email} autoComplete="username" readOnly hidden />
      <div className="field">
        <label className="lbl" htmlFor="password">New password</label>
        <input className="input" id="password" name="password" type="password" autoComplete="new-password" minLength={12} required />
      </div>
      <div className="field">
        <label className="lbl" htmlFor="confirm">Type it again</label>
        <input className="input" id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={12} required />
      </div>
      <SubmitButton className="btn big block" pendingText="Saving…">
        Save and sign in
      </SubmitButton>
    </form>
  );
}
