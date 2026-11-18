// Sends Hub events to the monday "Hub Requests" board.
// Column ids come from that board (created 2026-11-18). If someone renames a
// column in monday nothing breaks; deleting one does, so check before deleting.
import { getDb, getEnv } from "@/db";
import { attachments, clients, messages, requests, team } from "@/db/schema";
import { CHANNELS, SERVICES, type ServiceKey } from "./constants";
import { and, eq } from "drizzle-orm";

const COL = {
  status: "color_mm97vm22",
  client: "text_mm97v1hx",
  askedBy: "text_mm97q4p1",
  service: "color_mm97qj7",
  type: "dropdown_mm97reyv",
  howSoon: "color_mm97bvm8",
  owner: "multiple_person_mm9780fr",
  replyBy: "date_mm97mwd5",
  cameIn: "dropdown_mm97p2af",
  pageLink: "link_mm97nsyw",
  happening: "text_mm97pnh7",
  need: "text_mm97syg6",
  expected: "date_mm97891p",
  hubLink: "link_mm97wpfe",
  hubId: "text_mm975ppg",
} as const;

// Hub status → monday label. "Your turn" is what the client sees; the team sees "Waiting on client".
const STATUS_LABEL: Record<string, string> = {
  received: "Received",
  in_progress: "In progress",
  your_turn: "Waiting on client",
  done: "Done",
};
const SERVICE_LABEL: Record<string, string> = { web: "Website", social: "Social", seo: "SEO", ads: "Ads", other: "Other" };
const URGENCY_LABEL: Record<string, string> = { no_rush: "No rush", this_week: "This week", urgent: "Urgent" };

export type MondayConfig = { token: string; boardId: string; hubUrl: string; prefix: string };

export async function mondayConfig(): Promise<MondayConfig | null> {
  const env = (await getEnv()) as unknown as Record<string, string | undefined>;
  if (!env.MONDAY_API_TOKEN || !env.MONDAY_BOARD_ID) return null;
  return {
    token: env.MONDAY_API_TOKEN,
    boardId: env.MONDAY_BOARD_ID,
    hubUrl: (env.HUB_URL || "https://hub.theideafarm.com").replace(/\/$/, ""),
    prefix: env.MONDAY_ITEM_PREFIX || "",
  };
}

async function gql<T>(cfg: MondayConfig, query: string, variables: Record<string, unknown>): Promise<T> {
  const res = await fetch("https://api.monday.com/v2", {
    method: "POST",
    headers: { Authorization: cfg.token, "Content-Type": "application/json", "API-Version": "2025-04" },
    body: JSON.stringify({ query, variables }),
  });
  const json = (await res.json().catch(() => null)) as { data?: T; errors?: { message: string }[]; error_message?: string } | null;
  if (!res.ok || !json || json.errors?.length || json.error_message) {
    const msg = json?.errors?.map((e) => e.message).join("; ") || json?.error_message || `HTTP ${res.status}`;
    throw new Error(`monday: ${msg}`);
  }
  return json.data as T;
}

function utcDateTime(ms: number) {
  const iso = new Date(ms).toISOString();
  return { date: iso.slice(0, 10), time: iso.slice(11, 19) };
}

/** Every column the Hub owns, built from the request as it is right now. */
async function columnValues(cfg: MondayConfig, requestId: number) {
  const db = await getDb();
  const r = await db.query.requests.findFirst({ where: eq(requests.id, requestId) });
  if (!r) throw new Error(`Request ${requestId} no longer exists`);
  const client = await db.query.clients.findFirst({ where: eq(clients.id, r.clientId) });
  const owner = r.ownerId ? await db.query.team.findFirst({ where: eq(team.id, r.ownerId) }) : null;
  const typeName = r.type ? SERVICES[r.service as ServiceKey]?.types.find((t) => t[0] === r.type)?.[1] : null;

  const v: Record<string, unknown> = {
    [COL.status]: { label: STATUS_LABEL[r.status] ?? "Received" },
    [COL.client]: client?.name ?? r.clientId,
    [COL.askedBy]: r.askedBy,
    [COL.service]: { label: SERVICE_LABEL[r.service] ?? "Other" },
    [COL.howSoon]: { label: URGENCY_LABEL[r.urgency] ?? "No rush" },
    [COL.replyBy]: r.firstReplyAt ? null : utcDateTime(r.replyBy),
    [COL.cameIn]: { labels: [CHANNELS[r.channel as keyof typeof CHANNELS] ?? "Hub"] },
    [COL.happening]: r.statusLine ?? "",
    [COL.need]: r.status === "your_turn" ? (r.needText ?? "") : "",
    [COL.expected]: r.expected ? { date: r.expected } : null,
    [COL.hubLink]: { url: `${cfg.hubUrl}/team/requests/${r.id}`, text: "Open in Hub" },
    [COL.hubId]: String(r.id),
    [COL.type]: typeName ? { labels: [typeName] } : null,
    [COL.pageLink]: r.pageUrl ? { url: /^https?:\/\//.test(r.pageUrl) ? r.pageUrl : `https://${r.pageUrl}`, text: r.pageUrl } : null,
  };
  // Only set Owner when the Hub knows that person's monday account; otherwise leave it for the team.
  if (owner?.mondayUserId) v[COL.owner] = { personsAndTeams: [{ id: Number(owner.mondayUserId), kind: "person" }] };
  return { r, client, v };
}

async function createItem(cfg: MondayConfig, requestId: number) {
  const db = await getDb();
  const existing = await db.query.requests.findFirst({ where: eq(requests.id, requestId) });
  if (existing?.mondayItemId) return `Already on monday (item ${existing.mondayItemId})`;
  const { r, client, v } = await columnValues(cfg, requestId);
  const data = await gql<{ create_item: { id: string } }>(
    cfg,
    `mutation ($board: ID!, $name: String!, $values: JSON!) {
      create_item(board_id: $board, item_name: $name, column_values: $values, create_labels_if_missing: true) { id }
    }`,
    { board: cfg.boardId, name: `${cfg.prefix}${r.title}`.slice(0, 255), values: JSON.stringify(v) },
  );
  const itemId = data.create_item.id;
  await db.update(requests).set({ mondayItemId: itemId }).where(eq(requests.id, requestId));

  // First update on the item: what the client actually wrote, plus how many files are in the Hub.
  const fileCount = (await db.select({ id: attachments.id }).from(attachments).where(eq(attachments.requestId, requestId))).length;
  const first = await db.query.messages.findFirst({ where: and(eq(messages.requestId, requestId), eq(messages.authorType, "client")) });
  const lines = [
    `<p><b>${esc(r.askedBy)}</b> (${esc(client?.name ?? "")}) asked:</p>`,
    `<p>${esc(first?.body ?? r.details).replace(/\n/g, "<br>")}</p>`,
    fileCount ? `<p>📎 ${fileCount} file${fileCount > 1 ? "s" : ""} attached in the Hub.</p>` : "",
    `<p><a href="${cfg.hubUrl}/team/requests/${r.id}">Reply to the client in the Hub</a></p>`,
  ];
  await addUpdateRaw(cfg, itemId, lines.join(""));
  return `Created item ${itemId}`;
}

async function syncItem(cfg: MondayConfig, requestId: number) {
  const { r, v } = await columnValues(cfg, requestId);
  if (!r.mondayItemId) throw new Error("Waiting for the monday item to be created first");
  await gql(
    cfg,
    `mutation ($board: ID!, $item: ID!, $values: JSON!) {
      change_multiple_column_values(board_id: $board, item_id: $item, column_values: $values, create_labels_if_missing: true) { id }
    }`,
    { board: cfg.boardId, item: r.mondayItemId, values: JSON.stringify(v) },
  );
  return `Updated item ${r.mondayItemId}`;
}

async function addUpdateRaw(cfg: MondayConfig, itemId: string, body: string) {
  await gql(cfg, `mutation ($item: ID!, $body: String!) { create_update(item_id: $item, body: $body) { id } }`, { item: itemId, body });
}

async function addUpdate(cfg: MondayConfig, requestId: number, p: { name?: string; body?: string; internal?: boolean; from?: string; team?: boolean }) {
  const db = await getDb();
  const r = await db.query.requests.findFirst({ where: eq(requests.id, requestId) });
  if (!r?.mondayItemId) throw new Error("Waiting for the monday item to be created first");
  const who = p.team ? `${esc(p.from ?? "Team")} (Idea Farm)` : `${esc(p.name ?? r.askedBy)} (client)`;
  const tag = p.internal ? " · internal note, not shown to the client" : p.team ? " · sent to the client" : "";
  const body = `<p><b>${who}</b>${tag}:</p><p>${esc(p.body || "Sent files").replace(/\n/g, "<br>")}</p>`;
  await addUpdateRaw(cfg, r.mondayItemId, body);
  return `Added update to item ${r.mondayItemId}`;
}

function esc(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

/** Delivers one monday outbox event. Returns a short note, or throws with the reason it failed. */
export async function deliverMonday(cfg: MondayConfig, kind: string, payload: Record<string, unknown>, requestId: number | null) {
  if (!requestId) return null; // approvals stay in the Hub for now
  switch (kind) {
    case "create_item":
      return createItem(cfg, requestId);
    case "update_item":
    case "set_status":
    case "set_owner":
      return syncItem(cfg, requestId);
    case "add_update":
      return addUpdate(cfg, requestId, payload as Parameters<typeof addUpdate>[2]);
    default:
      return null;
  }
}

/** Active monday users (not guests), for linking team members to their monday account. */
export async function listMondayUsers(): Promise<{ id: string; name: string; email: string }[]> {
  const cfg = await mondayConfig();
  if (!cfg) return [];
  try {
    const data = await gql<{ users: { id: string; name: string; email: string; enabled: boolean }[] }>(
      cfg,
      `query { users(kind: non_guests, limit: 200) { id name email enabled } }`,
      {},
    );
    return data.users.filter((u) => u.enabled).map(({ id, name, email }) => ({ id, name, email })).sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}
