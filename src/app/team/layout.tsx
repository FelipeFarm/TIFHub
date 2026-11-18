import { and, isNull, ne } from "drizzle-orm";
import { getDb } from "@/db";
import { requests } from "@/db/schema";
import { requireTeam } from "@/lib/auth";
import { sendDueEmails } from "@/lib/outbox";
import { Nav } from "@/components/Nav";

export const dynamic = "force-dynamic";

export default async function TeamLayout({ children }: { children: React.ReactNode }) {
  const me = await requireTeam();
  // No scheduler on Webflow Cloud: page views send client emails that were held back to merge.
  await sendDueEmails();
  const db = await getDb();
  const toReply = await db
    .select({ id: requests.id })
    .from(requests)
    .where(and(isNull(requests.firstReplyAt), ne(requests.status, "done")));
  return (
    <div className="app">
      <Nav
        cta={{ href: "/team/log", label: "+ Log a request" }}
        items={[
          {
            href: "/team",
            label: "Inbox",
            badge: toReply.length ? `${toReply.length} to reply` : undefined,
            prefixes: ["/team/requests"],
          },
          { href: "/team/approvals", label: "Approvals" },
          { href: "/team/outbox", label: "Outbox" },
          ...(me.role === "admin" ? [{ href: "/team/admin", label: "Admin", prefixes: ["/team/admin"] }] : []),
        ]}
        who={me.name}
        whoSub="The Idea Farm"
      />
      <main className="main">{children}</main>
    </div>
  );
}
