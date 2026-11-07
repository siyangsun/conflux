import { arr, getEach, iso, item, parseXml, realTitle, teaser, txt } from "../feed.ts";
import { hash, htmlToText, imagesOf } from "../text.ts";
import type { Fetcher, Item } from "../types.ts";

// Any public RSS 2.0 / Atom feed of my own posts, labelled `source` (the name shown on the site).
// Covers Bluesky, Mastodon, Letterboxd, Goodreads, Medium, Pinboard, Reddit, WordPress... see the README for URLs.
export function parse(xml: string, now: string, source: string): Item[] {
  const doc = parseXml(xml);
  const rows = arr<any>(doc.rss?.channel?.item ?? doc.feed?.entry);
  return rows.flatMap((it): Item[] => {
    const link = typeof it.link === "string" ? it.link : arr<any>(it.link).find((l) => !l["@_rel"] || l["@_rel"] === "alternate")?.["@_href"] ?? "";
    const html = txt(it["content:encoded"] ?? it.description ?? it.content ?? it.summary);
    const date = txt(it.pubDate ?? it.published ?? it.updated);
    const key = txt(it.guid ?? it.id) || link;
    if (!key || !date) return [];
    const full = htmlToText(html);
    const title = realTitle(txt(it.title).trim(), full);
    const text = title ? teaser(full) : full; // titled = long-form essay: teaser only, like substack
    const enc = arr<any>(it.enclosure).filter((e) => String(e["@_type"]).startsWith("image/")).map((e) => e["@_url"]);
    return [item({
      id: `${source}:${hash(key)}`,
      source,
      type: "post",
      title,
      text,
      url: link,
      published_at: iso(date),
      fetched_at: now,
      images: title ? [] : [...new Set([...enc, ...imagesOf(html)])],
      tags: arr<any>(it.category).map((c) => txt(c["@_term"] ?? c)),
    })];
  });
}

const rss: Fetcher = async (cfg, prev) => {
  const now = new Date().toISOString();
  const feeds = cfg.feeds as { source: string; url: string }[];
  const { fresh, state } = await getEach(feeds.map((f) => f.url), prev);
  const items = fresh.flatMap(([u, xml]) => parse(xml, now, feeds.find((f) => f.url === u)!.source));
  return { items: items.filter((i) => !cfg.skip?.includes(i.id)), state }; // skip: item ids I deleted, never stored
};

export const required = ["feeds"];
export default rss;
