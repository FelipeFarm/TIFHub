import { and, eq, inArray, ne } from "drizzle-orm";
import type { Db } from "@/db";
import { approvals, requests, team, type Team } from "@/db/schema";

export async function teamMap(db: Db) {
  const rows = await db.select().from(team);
  return new Map<string, Team>(rows.map((t) => [t.id, t]));
}

/** How many things are waiting on this client (requests + approvals). */
export async function turnCount(db: Db, clientId: string) {
  const [r, a] = await Promise.all([
    db.select({ id: requests.id }).from(requests).where(and(eq(requests.clientId, clientId), eq(requests.status, "your_turn"))),
    db.select({ id: approvals.id }).from(approvals).where(and(eq(approvals.clientId, clientId), eq(approvals.status, "sent"))),
  ]);
  return r.length + a.length;
}

export async function openRequests(db: Db, clientId: string) {
  return db.query.requests.findMany({
    where: and(eq(requests.clientId, clientId), ne(requests.status, "done")),
    orderBy: (r, { desc }) => [desc(r.updatedAt)],
  });
}

export { inArray };
