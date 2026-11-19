// Links the team adds to approval items (videos, Google Docs…). Only https links are kept,
// and they always open in a new tab without passing anything back to the Hub.

export function safeLink(raw: string | null | undefined): string | null {
  const s = (raw ?? "").trim();
  if (!s || s.length > 500) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
    if (u.protocol !== "https:" || !u.hostname.includes(".")) return null;
    if (u.username || u.password) return null;
    return u.toString();
  } catch {
    return null;
  }
}

const KNOWN: [RegExp, string][] = [
  [/(^|\.)youtube\.com$|(^|\.)youtu\.be$/, "Watch on YouTube"],
  [/(^|\.)vimeo\.com$/, "Watch on Vimeo"],
  [/(^|\.)frame\.io$|(^|\.)f\.io$/, "Watch on Frame.io"],
  [/(^|\.)loom\.com$/, "Watch on Loom"],
  [/^docs\.google\.com$/, "Open in Google Docs"],
  [/^drive\.google\.com$/, "Open in Google Drive"],
  [/(^|\.)dropbox\.com$/, "Open in Dropbox"],
  [/(^|\.)canva\.com$/, "Open in Canva"],
  [/(^|\.)wetransfer\.com$|(^|\.)we\.tl$/, "Open in WeTransfer"],
];

/** "Watch on Vimeo", "Open in Google Docs", or the site's name for anything else. */
export function linkLabel(url: string) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return KNOWN.find(([re]) => re.test(host))?.[1] ?? `Open link (${host})`;
  } catch {
    return "Open link";
  }
}
