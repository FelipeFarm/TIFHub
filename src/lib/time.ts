// Pure date helpers, safe to import from server and client components.
export const TZ = "America/New_York";

const dayFmt = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: TZ });
const timeFmt = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: TZ });
const keyFmt = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: TZ });
const wdFmt = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: TZ });

const DAY = 86_400_000;

export const fmtDay = (ms: number) => dayFmt.format(ms);
export const fmtTime = (ms: number) => timeFmt.format(ms).replace(" AM", " am").replace(" PM", " pm");
export const fmtDayTime = (ms: number) => `${fmtDay(ms)}, ${fmtTime(ms)}`;
const dayKey = (ms: number) => keyFmt.format(ms);

/** "2025-11-26" → "Wed, Nov 26" */
export function fmtDateInput(v: string | null | undefined) {
  if (!v) return "";
  const ms = Date.parse(`${v}T12:00:00Z`);
  return Number.isNaN(ms) ? v : fmtDay(ms);
}

export function ago(ms: number, now = Date.now()) {
  const d = now - ms;
  if (d < 60_000) return "just now";
  if (d < 3_600_000) return `${Math.round(d / 60_000)} min ago`;
  if (dayKey(ms) === dayKey(now)) return `${Math.round(d / 3_600_000)}h ago`;
  if (dayKey(ms) === dayKey(now - DAY)) return "yesterday";
  return fmtDay(ms);
}

export function duration(ms: number) {
  if (ms < 3_600_000) return `${Math.max(1, Math.round(ms / 60_000))}m`;
  if (ms < DAY) return `${Math.round(ms / 3_600_000)}h`;
  const days = Math.round(ms / DAY);
  return `${days} day${days === 1 ? "" : "s"}`;
}

/** Same time on the next business day (skips Sat/Sun). Holidays not handled yet. */
export function nextBusinessDay(ms: number) {
  let t = ms + DAY;
  while (["Sat", "Sun"].includes(wdFmt.format(t))) t += DAY;
  return t;
}

/** Urgent requests get a 2-hour reply window instead of 1 business day. */
export function replyByFor(urgency: string, now = Date.now()) {
  return urgency === "urgent" ? now + 2 * 3_600_000 : nextBusinessDay(now);
}

export function replyByLabel(replyBy: number, now = Date.now()) {
  if (replyBy < now) return { text: `Overdue ${duration(now - replyBy)}`, late: true };
  if (dayKey(replyBy) === dayKey(now)) return { text: `Today, ${fmtTime(replyBy)}`, late: false };
  if (dayKey(replyBy) === dayKey(now + DAY)) return { text: `Tomorrow, ${fmtTime(replyBy)}`, late: false };
  return { text: fmtDayTime(replyBy), late: false };
}

export function todayInput(offsetDays = 0) {
  return dayKey(Date.now() + offsetDays * DAY);
}

/** Adds business days (Mon–Fri) in the Hub's time zone. */
export function addBusinessDays(ms: number, days: number) {
  let t = ms;
  for (let i = 0; i < days; i++) t = nextBusinessDay(t);
  return t;
}

/**
 * Default due date from "How soon", matching the monday Priority labels
 * (Urgent = 1 business day, This week = 3–4, No rush = 5–7). The team can change it.
 */
export function dueDateFor(urgency: string, now = Date.now()) {
  const days = urgency === "urgent" ? 1 : urgency === "this_week" ? 4 : 7;
  return dayKey(addBusinessDays(now, days));
}
