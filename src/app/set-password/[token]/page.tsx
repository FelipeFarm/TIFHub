import { findLoginLink, MIN_PASSWORD } from "@/lib/auth";
import { SetPasswordForm } from "./SetPasswordForm";

export const dynamic = "force-dynamic";

export default async function SetPasswordPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const found = await findLoginLink(token);
  return (
    <div className="login-wrap">
      <div className="login">
        <div className="logo">
          <i>IF</i>The Idea Farm
        </div>
        {found ? (
          <>
            <h1>{found.link.purpose === "invite" ? "Welcome to your Client Hub" : "Choose a new password"}</h1>
            <p className="sub">
              {found.link.userType === "client" ? <>This is the sign-in for <b>{found.name}</b>. </> : null}
              You&apos;ll sign in with <b>{found.email}</b>. Pick a password with at least {MIN_PASSWORD} characters. A short
              sentence is easy to remember and hard to guess.
            </p>
            <SetPasswordForm token={token} email={found.email} />
          </>
        ) : (
          <>
            <h1>This link doesn&apos;t work anymore</h1>
            <p className="sub">
              Sign-in links work once and expire after a day or two. Ask your Idea Farm contact for a new one.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
