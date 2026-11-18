export type ServiceKey = "web" | "social" | "seo" | "ads" | "other";

type Service = {
  label: string;
  short: string;
  hint: string;
  question: string | null;
  /** [key, label shown to client, small hint] */
  types: [string, string, string][];
};

// Website types match the "Type of Change" column on the monday change-request board.
export const SERVICES: Record<ServiceKey, Service> = {
  web: {
    label: "Website",
    short: "WEB",
    hint: "Changes, new pages, something broken",
    question: "What kind of website request?",
    types: [
      ["content", "Change text or photos", "Content update"],
      ["design", "Change the look", "Design change"],
      ["feature", "Add something new", "New page or feature"],
      ["bug", "Something's broken", "Bug"],
      ["other", "Other", ""],
    ],
  },
  social: {
    label: "Social media",
    short: "SOC",
    hint: "Posts, ideas, profiles",
    question: "What kind of social request?",
    types: [
      ["idea", "Post idea or topic", ""],
      ["change", "Change a scheduled post", ""],
      ["profile", "Profile or bio update", ""],
      ["other", "Other", ""],
    ],
  },
  seo: {
    label: "Google & SEO",
    short: "SEO",
    hint: "Rankings, Google profile, articles",
    question: "What kind of Google request?",
    types: [
      ["gbp", "Google Business Profile", "Hours, phone, photos"],
      ["article", "Article idea", ""],
      ["rankings", "Question about rankings", ""],
      ["other", "Other", ""],
    ],
  },
  ads: {
    label: "Ads",
    short: "ADS",
    hint: "Google, Facebook, LSA",
    question: "What kind of ads request?",
    types: [
      ["budget", "Pause or change budget", ""],
      ["promo", "New offer or promo", ""],
      ["results", "Question about results", ""],
      ["other", "Other", ""],
    ],
  },
  other: {
    label: "Something else",
    short: "•••",
    hint: "Questions, ideas, anything",
    question: null,
    types: [],
  },
};

export const SERVICE_KEYS = Object.keys(SERVICES) as ServiceKey[];

export function serviceLabel(key: string) {
  return SERVICES[key as ServiceKey]?.label ?? key;
}
export function serviceShort(key: string) {
  return SERVICES[key as ServiceKey]?.short ?? "•••";
}
export function typeLabel(service: string, type: string | null) {
  if (!type) return null;
  const t = SERVICES[service as ServiceKey]?.types.find((x) => x[0] === type);
  return t ? t[2] || t[1] : null;
}

// Same timeframes as the board's Priority column (Low 5–7d / Medium 3–4d / High 1d).
export const URGENCY = {
  no_rush: { label: "No rush", hint: "Within 5–7 days" },
  this_week: { label: "This week", hint: "Within 3–4 days" },
  urgent: { label: "Urgent", hint: "Something's down or wrong right now" },
} as const;
export type UrgencyKey = keyof typeof URGENCY;

export const STATUS = {
  received: "Received",
  in_progress: "In progress",
  your_turn: "Your turn",
  done: "Done",
} as const;
export type StatusKey = keyof typeof STATUS;

export const NEED_ACTIONS = ["Upload files", "Reply", "Approve"] as const;

export const CHANNELS = { hub: "Hub", email: "Email", phone: "Phone", text: "Text", meeting: "Meeting" } as const;

export const MAX_FILE_BYTES = 25 * 1024 * 1024;
export const MAX_FILES = 10;
