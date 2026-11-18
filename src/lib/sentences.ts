// The plain-language lines clients see. Shared by the client screens and the
// team's live preview so both always say exactly the same thing.
import { fmtDateInput } from "./time";

export type BannerInput = {
  status: string;
  statusLine?: string | null;
  expected?: string | null;
  needText?: string | null;
  needAction?: string | null;
  ownerName?: string | null;
  replyByText?: string | null;
};

export type Banner = { tone: "rec" | "prog" | "you" | "done"; title: string; sub: string; action?: string };

export function clientBanner(r: BannerInput): Banner {
  switch (r.status) {
    case "your_turn":
      return {
        tone: "you",
        title: "We need one thing from you",
        sub: r.needText || "Please check the latest message below.",
        action: r.needAction || "Reply",
      };
    case "in_progress":
      return {
        tone: "prog",
        title: r.statusLine || "We're working on it",
        sub: r.expected ? `Expected ${fmtDateInput(r.expected)}` : "",
      };
    case "done":
      return { tone: "done", title: "Done ✓", sub: "Something not right? Reply below and we'll reopen it." };
    default:
      return {
        tone: "rec",
        title: "Received",
        sub: `${firstName(r.ownerName) || "Your team"} will reply by ${(r.replyByText || "the next business day").replace(/^(Today|Tomorrow)/, (w) => w.toLowerCase())}.`,
      };
  }
}

/** One-line summary used in lists on the client's home screen. */
export function clientLine(r: BannerInput) {
  const b = clientBanner(r);
  if (r.status === "in_progress") return [b.title, b.sub].filter(Boolean).join(" · ");
  if (r.status === "received") return `Received · ${b.sub.replace(/\.$/, "")}`;
  if (r.status === "your_turn") return `Waiting on you · ${b.sub}`;
  return b.title;
}

export function firstName(name?: string | null) {
  return name ? name.split(" ")[0] : "";
}
