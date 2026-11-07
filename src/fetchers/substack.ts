import { arr, getEach, iso, item, parseXml, teaser, txt } from "../feed.ts";
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
      text: teaser(htmlToText(txt(it.description))), // the author's subtitle/teaser, never the essay
      url: txt(it.link),
      published_at: iso(txt(it.pubDate)),
      fetched_at: now,
      tags: arr<any>(it.category).map(txt),
      meta: { account: pub, account_url: `https://${pub}.substack.com` }, // shown as "via @pub"
    });
  });
}

const substack: Fetcher = async (cfg, prev) => {
  const now = new Date().toISOString();
  const name = (u: string) => u.match(/^https:\/\/([^.]+)\./)![1];
  const { fresh, state } = await getEach((cfg.names as string[]).map((n) => `https://${n}.substack.com/feed`), prev);
  return { items: fresh.flatMap(([u, xml]) => parse(xml, now, name(u))), state };
};

export const required = ["names"];
export default substack;
