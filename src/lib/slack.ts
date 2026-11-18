// Team alerts in Slack through an Incoming Webhook (one channel). The webhook URL is a
// secret: .dev.vars locally, a Webflow Cloud secret in production, never in code.
// Alerts carry only the request title and a link, not the client's full message or files.
import { eq, inArray } from "drizzle-orm";
import { getDb, getEnv } from "@/db";
import { clients, team } from "@/db/schema";
import { URGENCY, serviceLabel } from "./constants";
import { replyByLabel } from "./time";

export async function slackConfig() {
  const env = (await getEnv()) as unknown as Record<string, string | undefined>;
  const url = env.SLACK_WEBHOOK_URL?.trim();
  if (!url) return null;
  // Only Slack's own webhook host, so a wrong setting can't send client data anywhere else.
  // (Local tests may point at this computer.)
  const okHost = /^https:\/\/hooks\.slack\.com\/services\//.test(url) || (process.env.NODE_ENV !== "production" && /^http:\/\/(localhost|127\.0\.0\.1):\d+\//.test(url));
  if (!okHost) return null;
  return { url, hubUrl: (env.HUB_URL || "https://hub.theideafarm.com").replace(/\/$/, "") };
}

/** Text from clients goes into Slack as plain text: no @channel, no fake links, no formatting tricks. */
export function slackEscape(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/[\r\n]+/g, " ").slice(0, 200);
}

async function mentions(ids: (string | null | undefined)[]) {
  const wanted = [...new Set(ids.filter(Boolean) as string[])];
  if (!wanted.length) return "";
  const db = await getDb();
  const rows = await db.select().from(team).where(inArray(team.id, wanted));
  return rows
    .filter((t) => t.active)
    .map((t) => (t.slackUserId && /^[UW][A-Z0-9]{6,}$/.test(t.slackUserId) ? `<@${t.slackUserId}>` : slackEscape(t.name)))
    .join(" ");
}

type RequestLike = { id: number; clientId: string; title: string; service: string; urgency: string; ownerId: string | null; replyBy: number; askedBy: string };

/** Builds the alert text. Who gets @mentioned: the owner (or Account Lead); urgent ones also the backup. */
export async function requestAlert(kind: "new" | "reply", r: RequestLike, who?: string) {
  const cfg = await slackConfig();
  const hubUrl = cfg?.hubUrl ?? "https://hub.theideafarm.com";
  const db = await getDb();
  const client = await db.query.clients.findFirst({ where: eq(clients.id, r.clientId) });
  const urgent = r.urgency === "urgent";
  const tag = await mentions([r.ownerId ?? client?.leadId, urgent && kind === "new" ? client?.backupId : null]);
  const link = `<${hubUrl}/team/requests/${r.id}|${slackEscape(r.title)}>`;
  const company = slackEscape(client?.name ?? "A client");
  if (kind === "new") {
    return [
      `${urgent ? ":rotating_light: *Urgent* request" : ":inbox_tray: New request"} from *${company}* (${slackEscape(r.askedBy)})`,
      `${link}`,
      `${serviceLabel(r.service)} · ${URGENCY[r.urgency as keyof typeof URGENCY]?.label ?? r.urgency} · reply by ${replyByLabel(r.replyBy).text}${tag ? ` · ${tag}` : ""}`,
    ].join("\n");
  }
  return `:speech_balloon: *${company}* replied (${slackEscape(who ?? r.askedBy)}) on ${link}${tag ? ` · ${tag}` : ""}`;
}

export async function reviewAlert(a: { id: number; clientId: string; title: string; ownerId: string | null }, who: string, approved: number, changes: number) {
  const cfg = await slackConfig();
  const hubUrl = cfg?.hubUrl ?? "https://hub.theideafarm.com";
  const db = await getDb();
  const client = await db.query.clients.findFirst({ where: eq(clients.id, a.clientId) });
  const tag = await mentions([a.ownerId ?? client?.leadId]);
  const result = changes ? `${approved} approved, *${changes} need${changes === 1 ? "s" : ""} changes*` : `all ${approved} approved`;
  return `${changes ? ":pencil2:" : ":white_check_mark:"} *${slackEscape(client?.name ?? "A client")}* reviewed <${hubUrl}/team/approvals|${slackEscape(a.title)}> (${slackEscape(who)}): ${result}${tag ? ` · ${tag}` : ""}`;
}

export async function deliverSlack(payload: { text: string }) {
  const cfg = await slackConfig();
  if (!cfg) throw new Error("Slack isn't connected");
  const res = await fetch(cfg.url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // link_names off and parse none: only the <@U…> mentions we built ourselves notify anyone.
    body: JSON.stringify({ text: payload.text, unfurl_links: false, unfurl_media: false }),
  });
  if (!res.ok) throw new Error(`Slack: HTTP ${res.status} ${(await res.text().catch(() => "")).slice(0, 100)}`);
  return "Posted to Slack";
}
