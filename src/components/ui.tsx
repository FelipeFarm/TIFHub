// Small server-safe UI pieces shared by client and team screens.
import Link from "next/link";
import type { Attachment, Message } from "@/db/schema";
import { STATUS } from "@/lib/constants";
import { fileSize, fileUrl, INLINE } from "@/lib/files";
import { fmtDayTime } from "@/lib/time";
import type { Banner } from "@/lib/sentences";

export function StatusPill({ status, isNew }: { status: string; isNew?: boolean }) {
  if (isNew) return <span className="pill new">New</span>;
  const cls = status === "your_turn" ? "you" : status === "in_progress" ? "prog" : status === "done" ? "done" : "";
  return <span className={`pill ${cls}`}>{STATUS[status as keyof typeof STATUS] ?? status}</span>;
}

export function Stepper({ status }: { status: string }) {
  const steps = ["received", "in_progress", "your_turn", "done"] as const;
  const cur = steps.indexOf(status as (typeof steps)[number]);
  return (
    <div className="stepper" aria-label={`Status: ${STATUS[status as keyof typeof STATUS]}`}>
      {steps.map((s, i) => (
        <div key={s} className={i < cur ? "done" : i === cur ? `cur ${s === "your_turn" ? "you" : ""}` : ""}>
          {STATUS[s]}
        </div>
      ))}
    </div>
  );
}

export function BannerBox({ b, href }: { b: Banner; href?: string }) {
  return (
    <div className={`banner ${b.tone}`}>
      <div>
        <b>{b.title}</b>
        {b.sub && <div className="bsub">{b.sub}</div>}
      </div>
      {b.action && href && (
        <a className="btn sm" href={href}>
          {b.action}
        </a>
      )}
    </div>
  );
}

export function Files({ files }: { files: Attachment[] }) {
  if (!files.length) return null;
  return (
    <div className="files">
      {files.map((f) =>
        f.type.startsWith("image/") && INLINE.test(f.type) ? (
          <a key={f.id} href={fileUrl(f.key)} target="_blank" rel="noreferrer" title={f.name}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="thumb" src={fileUrl(f.key)} alt={f.name} />
          </a>
        ) : (
          <a key={f.id} className="file" href={fileUrl(f.key)} target="_blank" rel="noreferrer">
            <i />
            <span>{f.name}</span>
            <small className="muted">{fileSize(f.size)}</small>
          </a>
        ),
      )}
    </div>
  );
}

export function Thread({
  messages, files, initials, showInternal = false, clientSide = false,
}: {
  messages: Message[];
  files: Attachment[];
  initials: (m: Message) => string;
  showInternal?: boolean;
  clientSide?: boolean;
}) {
  return (
    <div className="thread">
      {messages
        .filter((m) => showInternal || !m.internal)
        .map((m) =>
          m.authorType === "system" ? (
            <div key={m.id} className="event">
              {m.body} · {fmtDayTime(m.createdAt)}
            </div>
          ) : (
            <div key={m.id} className={`msg ${m.authorType === "team" ? "team" : ""} ${m.internal ? "internal" : ""}`}>
              <div className={`av ${m.authorType === "client" ? "client" : ""}`}>{initials(m)}</div>
              <div className="body">
                <div className="meta">
                  {m.authorName}
                  {m.authorType === "team" && clientSide ? " · The Idea Farm" : ""}
                  {m.authorType === "client" && !clientSide ? " · client" : ""}
                  {m.internal ? " · internal note, client can't see this" : ""} · {fmtDayTime(m.createdAt)}
                </div>
                {m.body}
                <Files files={files.filter((f) => f.messageId === m.id)} />
              </div>
            </div>
          ),
        )}
    </div>
  );
}

export const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");

export function TrialNote({ children }: { children: React.ReactNode }) {
  return <div className="trial">{children}</div>;
}

export { Link };
