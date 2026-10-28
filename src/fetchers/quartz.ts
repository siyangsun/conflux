import { get, item } from "../feed.ts";
import { hash } from "../text.ts";
import type { Fetcher, Item } from "../types.ts";

type Page = { slug: string; filePath?: string; title?: string; content?: string; links?: string[]; tags?: string[] };
const fingerprint = (p: Page) => hash(JSON.stringify([p.title, p.content, p.links, p.tags]));

type Changed = { title: string; url: string; status: "added" | "updated" };

// One "Updated N pages" entry; `published_at` is when the change happened (a run time, or a sitemap lastmod when backfilling).
function siteUpdate(id: string, pages: Changed[], base: string, published_at: string, fetched_at: string): Item {
  const n = pages.length;
  return item({
    id,
    source: "quartz",
    type: "site-update",
    kind: "activity",
    title: `Updated ${n} page${n > 1 ? "s" : ""}`,
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

// Backfill: the sitemap's <lastmod> is each page's last-modified time. Pages sharing a day become one entry, all "updated".
export function fromSitemap(sitemap: string, index: Record<string, Page>, cfg: Record<string, any>, now: string): Item[] {
  const base = cfg.site_url.replace(/\/?$/, "/");
  const byDay = new Map<string, { at: string; pages: Changed[] }>();
  for (const [, loc, at] of sitemap.matchAll(/<loc>([^<]+)<\/loc>\s*<lastmod>([^<]+)<\/lastmod>/g)) {
    // Quartz's sitemap may omit the site's sub-path (/courtyard/) when baseUrl was set without it: accept both.
    const path = new URL(loc).pathname, prefix = new URL(base).pathname;
    const slug = (path.startsWith(prefix) ? path.slice(prefix.length) : path.slice(1)).replace(/\/$/, "") || "index";
    const day = new Date(at).toISOString().slice(0, 10);
    const e = byDay.get(day) ?? byDay.set(day, { at, pages: [] }).get(day)!;
    if (at > e.at) e.at = at;
    e.pages.push({ title: index[slug]?.title || slug, url: slug === "index" ? base : base + slug, status: "updated" });
  }
  return [...byDay].map(([day, { at, pages }]) =>
    siteUpdate(`quartz:backfill-${day}`, pages.sort((a, b) => a.title.localeCompare(b.title)), base, new Date(at).toISOString(), now));
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
