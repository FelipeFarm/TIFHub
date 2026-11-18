"use client";

import { useActionState } from "react";
import { login } from "@/app/actions";
import { FormError, SubmitButton } from "@/components/forms";

export function LoginForm() {
  const [state, action] = useActionState(login, undefined);
  return (
    <form action={action}>
      <FormError state={state} />
      <div className="field">
        <label className="lbl" htmlFor="email">Email</label>
        <input className="input" id="email" name="email" type="email" autoComplete="username" required />
      </div>
      <div className="field">
        <label className="lbl" htmlFor="password">Password</label>
        <input className="input" id="password" name="password" type="password" autoComplete="current-password" required />
      </div>
      <label className="check-row">
        <input type="checkbox" name="remember" defaultChecked /> Keep me signed in on this device
      </label>
      <SubmitButton className="btn big block" pendingText="Signing in…">
        Sign in
      </SubmitButton>
      <p className="muted" style={{ textAlign: "center", marginTop: 14 }}>
        Forgot your password? Ask your account lead and we&apos;ll reset it.
      </p>
    </form>
  );
}
