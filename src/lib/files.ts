import { getDb, getEnv } from "@/db";
import { attachments } from "@/db/schema";
import { MAX_FILE_BYTES, MAX_FILES } from "./constants";

const ALLOWED = /^(image\/(png|jpe?g|gif|webp|heic|heif)|application\/pdf|text\/plain|application\/(msword|vnd\.openxmlformats-officedocument\.[a-z.]+|vnd\.ms-excel|zip))$/;

/** Types that are safe to show in the browser; everything else downloads. */
export const INLINE = /^(image\/(png|jpe?g|gif|webp)|application\/pdf)$/;

export function filesFrom(fd: FormData, field = "files") {
  return fd.getAll(field).filter((f): f is File => f instanceof File && f.size > 0);
}

export function checkFiles(files: File[]) {
  if (files.length > MAX_FILES) return `Please attach ${MAX_FILES} files or fewer.`;
  for (const f of files) {
    if (f.size > MAX_FILE_BYTES) return `"${f.name}" is too big (max 25 MB).`;
    if (!ALLOWED.test(f.type)) return `"${f.name}" isn't a supported file type. Photos, PDFs and Office documents work.`;
  }
  return null;
}

export async function saveFiles(
  files: File[],
  link: { clientId: string; requestId?: number; messageId?: number; approvalId?: number },
) {
  if (!files.length) return [];
  const env = await getEnv();
  const db = await getDb();
  const saved = [];
  for (const f of files) {
    const safe = f.name.replace(/[^\w.\-]+/g, "_").slice(-80) || "file";
    const key = `${link.clientId}/${crypto.randomUUID()}/${safe}`;
    await env.FILES.put(key, await f.arrayBuffer(), { httpMetadata: { contentType: f.type } });
    const [row] = await db
      .insert(attachments)
      .values({ ...link, key, name: f.name.slice(0, 200), type: f.type, size: f.size, createdAt: Date.now() })
      .returning();
    saved.push(row);
  }
  return saved;
}

export const fileUrl = (key: string) => `/files/${key.split("/").map(encodeURIComponent).join("/")}`;

export function fileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
