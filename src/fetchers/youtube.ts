import { arr, feedFetcher, iso, item, parseXml, txt } from "../feed.ts";
import { decode } from "../text.ts";
import type { Item } from "../types.ts";

export function parse(xml: string, now: string): Item[] {
  return arr<any>(parseXml(xml).feed?.entry).map((e) => {
    const vid = txt(e["yt:videoId"]);
    const g = e["media:group"] ?? {};
    const href = arr<any>(e.link).find((l) => l["@_rel"] === "alternate")?.["@_href"] ?? `https://www.youtube.com/watch?v=${vid}`;
    return item({
      id: `youtube:${vid}`,
      source: "youtube",
      type: "video",
      title: txt(e.title) || undefined,
      text: txt(g["media:description"]).trim(),
      url: href,
      published_at: iso(txt(e.published)),
      fetched_at: now,
      embed: { provider: "youtube", id: vid },
    });
  });
}

export default feedFetcher((c) => `https://www.youtube.com/feeds/videos.xml?channel_id=${c.channel_id}`, parse);
// Backfill only: the RSS feed stops at 15 videos, so older ones are read from their watch page.
export function parseWatch(html: string, id: string, now: string): Item {
  const meta = (re: RegExp) => html.match(re)?.[1];
  const desc = meta(/"shortDescription":"((?:[^"\\]|\\.)*)"/);
  return item({
    id: `youtube:${id}`,
    source: "youtube",
    type: "video",
    title: decode(meta(/<meta name="title" content="([^"]*)"/) ?? "") || undefined,
    text: desc ? JSON.parse(`"${desc}"`).trim() : "",
    url: `https://www.youtube.com/watch?v=${id}`,
    published_at: iso(meta(/itemprop="uploadDate" content="([^"]+)"/) ?? meta(/"uploadDate":"([^"]+)"/)!),
    fetched_at: now,
    embed: { provider: "youtube", id },
  });
}

export const required = ["channel_id"];
