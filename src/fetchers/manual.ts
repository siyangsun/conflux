import { readdirSync, readFileSync } from "node:fs";
import { item } from "../feed.ts";
import { hash } from "../text.ts";
import { loadAll } from "../store.ts";
import { unfurl as realUnfurl, type Unfurl } from "../unfurl.ts";
import type { Fetcher, Item } from "../types.ts";

const DIR = "posts";

// Frontmatter is flat "key: value" lines between --- fences; the rest is the post text.
export function parsePost(raw: string) {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  const meta: Record<string, string> = {};
  for (const line of (m ? m[1] : "").split(/\r?\n/)) {
    const kv = line.match(/^(\w+)\s*:\s*(.*?)\s*$/);
    if (kv) meta[kv[1]] = kv[2].replace(/^["']|["']$/g, "");
  }
  return { meta, body: (m ? m[2] : raw).trim() };
}

// ponytail: "co.uk"-style domains give the wrong source name; set `source:` in frontmatter.
export const sourceFromUrl = (url: string) => new URL(url).hostname.split(".").at(-2) ?? "manual";

// `prev` is the stored version when re-reading an edited post: it keeps its first-seen dates unless the frontmatter sets one.
export function toItem(stem: string, raw: string, u: Unfurl, now: string, prev?: Item): Item {
  const { meta, body } = parsePost(raw);
  const url = meta.url ?? "";
  return item({
    id: `manual:${stem}`,
    source: meta.source || (url ? sourceFromUrl(url) : "manual"),
    type: "post",
    title: meta.title || u.title,
    text: body || u.description || "",
    url,
    published_at: new Date(meta.published_at ?? prev?.published_at ?? now).toISOString(),
    fetched_at: prev?.fetched_at ?? now,
    rev: hash(raw),
    images: u.image ? [u.image] : [],
    ...(u.embed && { embed: u.embed }),
  });
}

// published_at defaults to the first run that sees the file, which is minutes after the push.
// New or edited files are re-read; the preview is fetched only for a new post or a changed url.
// A stored manual post whose file is gone is removed. (It stays in git history: the repo is public.)
const manual: Fetcher = async () => {
  let files: string[] = [];
  try { files = readdirSync(DIR).filter((f) => f.endsWith(".md")); } catch (e: any) { if (e.code !== "ENOENT") throw e; }
  const stored = new Map(loadAll().filter((i) => i.id.startsWith("manual:")).map((i) => [i.id, i]));
  const now = new Date().toISOString();
  const items: Item[] = [];
  for (const f of files) {
    const stem = f.replace(/\.md$/, "");
    try {
      const raw = readFileSync(`${DIR}/${f}`, "utf8");
      const old = stored.get(`manual:${stem}`);
      if (old?.rev === hash(raw)) continue;
      const url = parsePost(raw).meta.url;
      const u = !url ? {} : old && url === old.url ? { title: old.title, image: old.images[0], embed: old.embed } : await realUnfurl(url);
      items.push(toItem(stem, raw, u, now, old));
    } catch (e) {
      console.error(`::warning::posts/${f} skipped: ${(e as Error).message}`);
    }
  }
  const present = new Set(files.map((f) => `manual:${f.replace(/\.md$/, "")}`));
  return { items, state: {}, remove: [...stored.keys()].filter((id) => !present.has(id)) };
};

export default manual;
