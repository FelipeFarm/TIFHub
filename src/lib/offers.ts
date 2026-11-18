// Offers for Idea Farm services a client doesn't have yet.
// ALL WORDING HERE IS CLIENT-FACING: Jose approves it before OFFERS_LIVE is turned on.
// No prices on purpose: "I'm interested" starts a conversation with the Account Lead.
import { and, eq, gt, isNull } from "drizzle-orm";
import { getDb, getEnv } from "@/db";
import { offerEvents, requests, type Client, type Request } from "@/db/schema";

export const OFFER_SERVICES = ["seo", "ads", "web", "social"] as const;
export type OfferService = (typeof OFFER_SERVICES)[number];

export const SERVICE_NAMES: Record<OfferService, string> = {
  web: "Website care",
  social: "Social media",
  seo: "Google & SEO",
  ads: "Ads",
};

/** The Home card: one line on what each service does for them. */
export const OFFER_CARDS: Record<OfferService, string> = {
  seo: "Show up when people nearby search for what you do. We look after your Google profile and rankings every month.",
  ads: "Google, Facebook and Local Services Ads that bring in calls and leads, tracked so you can see what each one brings.",
  web: "Updates, fixes and new pages without separate quotes, plus security and backups taken care of.",
  social: "A monthly calendar of posts for Facebook, Instagram and LinkedIn, designed and scheduled for you.",
};

/** After a request: a suggestion that fits what they just asked for. */
type Suggestion = { service: OfferService; title: string; body: string };
const SUGGESTIONS = {
  promoAds: {
    service: "ads",
    title: "Want more people to see this?",
    body: "A post reaches the people who already follow you. A small Facebook and Instagram ad puts the same offer in front of people nearby who don't know you yet.",
  },
  adsRequest: {
    service: "ads",
    title: "Want us to run ads for you?",
    body: "We set up and manage Google, Facebook and Local Services Ads, tracked so you can see the calls each one brings.",
  },
  seoRequest: {
    service: "seo",
    title: "Want this looked after every month?",
    body: "Our SEO plans keep your Google profile accurate and work on your rankings every month, so things like this get caught early.",
  },
  manyWebChanges: {
    service: "web",
    title: "Lots of website changes lately?",
    body: "A website care plan covers updates like these without separate quotes, plus security and backups.",
  },
} satisfies Record<string, Suggestion>;

const PROMO = /\b(promo|promotion|sale|offer|discount|special|deal|coupon|% off|\$\d+ off|off for)\b/i;
const HIDE_DAYS = 90;

export function servicesOf(client: Pick<Client, "services">): OfferService[] {
  try {
    const list = JSON.parse(client.services) as string[];
    return OFFER_SERVICES.filter((s) => list.includes(s));
  } catch {
    return [];
  }
}

/** Offers only reach clients once the whole Hub is switched on (after Jose approves the wording). */
export async function offersLive() {
  const env = (await getEnv()) as unknown as Record<string, string | undefined>;
  return env.OFFERS_LIVE === "1";
}

/** Services this client could be offered right now: not had, not dismissed lately, not already asked about. */
export async function availableOffers(client: Client): Promise<OfferService[]> {
  if (!client.offersOn) return [];
  const have = servicesOf(client);
  const db = await getDb();
  const since = Date.now() - HIDE_DAYS * 86_400_000;
  const recent = await db.query.offerEvents.findMany({
    where: and(eq(offerEvents.clientId, client.id), gt(offerEvents.at, since)),
  });
  const openInterest = await db.query.offerEvents.findMany({
    where: and(eq(offerEvents.clientId, client.id), eq(offerEvents.action, "interested"), isNull(offerEvents.handledAt)),
  });
  const blocked = new Set([...recent.map((e) => e.service), ...openInterest.map((e) => e.service)]);
  return OFFER_SERVICES.filter((s) => !have.includes(s) && !blocked.has(s));
}

/** The one suggestion (or none) to show right after this request was sent. */
export async function suggestionFor(client: Client, r: Request): Promise<Suggestion | null> {
  if (r.urgency === "urgent") return null; // never when something's wrong
  const open = await availableOffers(client);
  const can = (s: OfferService) => open.includes(s);
  const text = `${r.title} ${r.details}`;

  if (r.service === "ads" && can("ads")) return SUGGESTIONS.adsRequest;
  if ((r.service === "social" || r.service === "other") && PROMO.test(text) && can("ads")) return SUGGESTIONS.promoAds;
  if (r.service === "seo" && can("seo")) return SUGGESTIONS.seoRequest;
  if (r.service === "web" && can("web")) {
    const db = await getDb();
    const monthAgo = Date.now() - 30 * 86_400_000;
    const recentWeb = await db.query.requests.findMany({
      where: and(eq(requests.clientId, client.id), eq(requests.service, "web"), gt(requests.createdAt, monthAgo)),
    });
    if (recentWeb.length >= 3) return SUGGESTIONS.manyWebChanges;
  }
  return null;
}

export async function openInterestCount() {
  const db = await getDb();
  const rows = await db.query.offerEvents.findMany({
    where: and(eq(offerEvents.action, "interested"), isNull(offerEvents.handledAt)),
  });
  return rows.length;
}

export const isOfferService = (s: string): s is OfferService => (OFFER_SERVICES as readonly string[]).includes(s);
