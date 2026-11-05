import { get, item } from "../feed.ts";
import { hash } from "../text.ts";
import type { Fetcher, Item } from "../types.ts";

type Page = { slug: string; filePath?: string; title?: string; content?: string; links?: string[]; tags?: string[] };
const fingerprint = (p: Page) => hash(JSON.stringify([p.title, p.content, p.links, p.tags]));

type Changed = { title: string; url: string; status: "added" | "updated" };

// One "Updated N pages" (or "Added") entry; `published_at` is when the change happened (a run time, or a commit time when backfilling).
function siteUpdate(id: string, pages: Changed[], base: string, published_at: string, fetched_at: string, verb = "Updated"): Item {
  const n = pages.length;
  return item({
    id,
    source: "quartz",
    type: "site-update",
    kind: "activity",
    title: `${verb} ${n} page${n > 1 ? "s" : ""}`,
    text: pages.map((p) => `${p.title} (${p.status})`).join("\n"),
    url: n === 1 ? pages[0].url : base,
    published_at,
    fetched_at,
    meta: { pages },
  });
}

// The live index only lists published pages, so drafts never appear. Compares per-page fingerprints to the last run.
// First run (no prev) just records the baseline. Deleted pages are dropped from the baseline and not announced.
export function diff(index: Record<string, Page>, prev: Record<string, string> | undefined, cfg: Record<string, any>, now: string) {
  const base = cfg.site_url.replace(/\/?$/, "/");
  const hashes: Record<string, string> = {};
  const changed: { slug: string; title: string; url: string; status: "added" | "updated" }[] = [];
  for (const p of Object.values(index)) {
    hashes[p.slug] = fingerprint(p);
    if (!prev) continue;
    const status = !(p.slug in prev) ? "added" : prev[p.slug] !== hashes[p.slug] ? "updated" : null;
    if (status) changed.push({ slug: p.slug, title: p.title || p.slug, url: p.slug === "index" ? base : base + p.slug, status });
  }
  // A new page is a post (link only); edits to existing pages are batched into one activity digest.
  const items: Item[] = changed.filter((c) => c.status === "added").map((c) => item({
    id: `quartz:page:${c.slug}`, source: "quartz", type: "page", title: c.title, text: "", url: c.url, published_at: now, fetched_at: now,
  }));
  const updated = changed.filter((c) => c.status === "updated");
  if (updated.length) {
    const id = `quartz:${hash(updated.map((c) => c.slug + hashes[c.slug]).sort().join())}`;
    items.push(siteUpdate(id, updated.map(({ title, url, status }) => ({ title, url, status })), base, now, now));
  }
  return { hashes, items };
}

// Backfill from the content repo's git history (slug -> commit times, oldest first; the content index has no dates). Per day, the pages
// first committed that day become one "Added" entry and the other pages committed that day one "Updated" entry.
export function fromHistory(history: Record<string, string[]>, index: Record<string, Page>, cfg: Record<string, any>, now: string): Item[] {
  const base = cfg.site_url.replace(/\/?$/, "/");
  const days = new Map<string, { at: string; status: "added" | "updated"; pages: Map<string, Changed> }>();
  for (const [slug, times] of Object.entries(history)) {
    if (!index[slug]) continue;
    const iso = times.map((t) => new Date(t).toISOString()), created = iso[0]?.slice(0, 10);
    iso.forEach((t, k) => {
      const day = t.slice(0, 10), status = k === 0 ? "added" : "updated";
      if (status === "updated" && day === created) return; // edited the day it was created: already in "Added"
      const e = days.get(`${status}-${day}`) ?? days.set(`${status}-${day}`, { at: t, status, pages: new Map() }).get(`${status}-${day}`)!;
      if (t > e.at) e.at = t;
      e.pages.set(slug, { title: index[slug].title || slug, url: slug === "index" ? base : base + slug, status });
    });
  }
  return [...days].map(([key, { at, status, pages }]) =>
    siteUpdate(`quartz:backfill-${key}`, [...pages.values()].sort((a, b) => a.title.localeCompare(b.title)), base, at, now, status === "added" ? "Added" : "Updated"));
}

const quartz: Fetcher = async (cfg, prev) => {
  const base = cfg.site_url.replace(/\/?$/, "/");
  const r = await get(`${base}static/contentIndex.json`, prev);
  if (!r) return { items: [], state: {} };
  const { items, hashes } = diff(JSON.parse(r.text), prev.hashes, cfg, new Date().toISOString());
  return { items, state: { ...r.cache, hashes }, persist: !prev.hashes };
};

export default quartz;
export const required = ["site_url"];
