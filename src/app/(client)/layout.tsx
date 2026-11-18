import { getDb } from "@/db";
import { requireClient } from "@/lib/auth";
import { turnCount } from "@/lib/queries";
import { Nav } from "@/components/Nav";

export const dynamic = "force-dynamic";

export default async function ClientLayout({ children }: { children: React.ReactNode }) {
  const client = await requireClient();
  const n = await turnCount(await getDb(), client.id);
  return (
    <div className="app">
      <Nav
        tabbar
        cta={{ href: "/new", label: "+ Ask us something" }}
        items={[
          { href: "/", label: "Home" },
          {
            href: "/requests",
            label: "My requests",
            badge: n ? `${n} need${n === 1 ? "s" : ""} you` : undefined,
            prefixes: ["/requests", "/approvals"],
          },
        ]}
        who={client.name}
        whoSub="Signed in as the company"
      />
      <main className="main">{children}</main>
    </div>
  );
}
