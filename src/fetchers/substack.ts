import { arr, get, iso, item, parseXml, txt } from "../feed.ts";
import { htmlToText } from "../text.ts";
import type { Fetcher, Item } from "../types.ts";

// Link plus teaser: title, date, tags and the short RSS description; never the essay text or its image.
export function parse(xml: string, now: string, pub: string): Item[] {
  return arr<any>(parseXml(xml).rss?.channel?.item).map((it) => {
    const slug = txt(it.link).match(/\/p\/([^/?#]+)/)?.[1] ?? txt(it.guid);
    return item({
      id: `substack:${pub}:${slug}`,
      source: "substack",
      type: "post",
      title: txt(it.title) || undefined,
      text: htmlToText(txt(it.description)).slice(0, 300), // the author's subtitle/teaser, never the essay
      url: txt(it.link),
      published_at: iso(txt(it.pubDate)),
      fetched_at: now,
      tags: arr<any>(it.category).map(txt),
      meta: { account: pub, account_url: `https://${pub}.substack.com` }, // shown as "via @pub"
    });
  });
}

// ponytail: no conditional GET (state holds one etag, there are several feeds); feeds are small, add per-feed etags if that changes.
const substack: Fetcher = async (cfg) => {
  const now = new Date().toISOString();
  const lists = await Promise.all((cfg.names as string[]).map(async (n) => parse((await get(`https://${n}.substack.com/feed`, {}))!.text, now, n)));
  return { items: lists.flat(), state: {} };
};

export const required = ["names"];
export default substack;
