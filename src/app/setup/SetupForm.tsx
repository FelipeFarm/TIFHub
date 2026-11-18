"use client";

import { useActionState } from "react";
import { createFirstAdmin } from "@/app/admin-actions";
import { FormError, SubmitButton } from "@/components/forms";

export function SetupForm() {
  const [state, action] = useActionState(createFirstAdmin, undefined);
  return (
    <form action={action}>
      <FormError state={state} />
      <div className="field">
        <label className="lbl" htmlFor="secret">Setup secret</label>
        <input className="input" id="secret" name="secret" type="password" autoComplete="off" required />
      </div>
      <div className="field">
        <label className="lbl" htmlFor="name">Your name</label>
        <input className="input" id="name" name="name" autoComplete="name" required maxLength={120} />
      </div>
      <div className="field">
        <label className="lbl" htmlFor="email">Work email</label>
        <input className="input" id="email" name="email" type="email" autoComplete="username" required />
      </div>
      <SubmitButton className="btn big block" pendingText="Setting up…">
        Continue
      </SubmitButton>
    </form>
  );
}
