import { notFound } from "next/navigation";
import { setupOpen } from "@/lib/setup";
import { SetupForm } from "./SetupForm";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  // Looks like any missing page unless setup is switched on and no admin exists yet.
  if (!(await setupOpen())) notFound();
  return (
    <div className="login-wrap">
      <div className="login">
        <div className="logo">
          <i>IF</i>The Idea Farm
        </div>
        <h1>Set up the first admin</h1>
        <p className="sub">
          This page only works once. Enter the setup secret from Webflow Cloud, then your name and work email. You&apos;ll
          choose your password on the next screen.
        </p>
        <SetupForm />
      </div>
    </div>
  );
}
