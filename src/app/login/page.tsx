import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { LoginForm } from "./LoginForm";
import { Logo } from "@/components/Logo";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const s = await getSession();
  if (s) redirect(s.type === "team" ? "/team" : "/");
  return (
    <div className="login-wrap">
      <div className="login">
        <div className="logo">
          <Logo height={84} />
        </div>
        <h1>Client Hub</h1>
        <p className="sub">Send us requests and see where everything stands.</p>
        <LoginForm />
      </div>
    </div>
  );
}
