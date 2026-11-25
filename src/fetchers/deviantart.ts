import { arr, iso, item, parseXml, txt } from "../feed.ts";
import { htmlToText } from "../text.ts";
import type { Item } from "../types.ts";

// Backfill only (src/backfill.ts): my favourites from DeviantArt's public RSS, stored as reblogs. It is not in config.sources, so run.ts never calls it.
// The RSS has no "favourited at" time, so each item is dated by when the artwork was posted. Mature artwork is not in the feed.
export function parse(xml: string, now: string): Item[] {
  return arr<any>(parseXml(xml).rss?.channel?.item).flatMap((it): Item[] => {
    const url = txt(it.link), id = url.match(/-(\d+)$/)?.[1];
    if (!id) return [];
    const author = arr<any>(it["media:credit"]).map(txt).find((c) => /^[\w-]+$/.test(c)); // the other credit is the avatar URL
    const thumb = arr<any>(it["media:thumbnail"]).sort((a, b) => Number(b["@_width"]) - Number(a["@_width"]))[0]?.["@_url"];
    return [item({
      id: `deviantart:${id}`,
      source: "deviantart",
      type: "post",
      kind: "reblog",
      title: txt(it.title) || undefined,
      text: htmlToText(txt(it["media:description"])),
      url,
      published_at: iso(txt(it.pubDate)),
      fetched_at: now,
      images: thumb ? [thumb] : [],
      meta: author ? { account: author, account_url: `https://www.deviantart.com/${author}` } : {},
    })];
  });
}

// Each feed page links to the next: <atom:link rel="next" href="...&offset=60">.
export const nextUrl = (xml: string) => xml.match(/<atom:link rel="next" href="([^"]+)"/)?.[1]?.replaceAll("&amp;", "&");
export const feedUrl = (user: string) => `https://backend.deviantart.com/rss.xml?type=deviation&q=${encodeURIComponent(`favby:${user}`)}`;
