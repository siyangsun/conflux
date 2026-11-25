import { arr, get, getEach, iso, item, parseXml, teaser, txt } from "../feed.ts";
import { htmlToText, imagesOf } from "../text.ts";
import type { Fetcher, Item } from "../types.ts";

const idOf = (it: any, pub: string) => `substack:${pub}:${txt(it.link).match(/\/p\/([^/?#]+)/)?.[1] ?? txt(it.guid)}`;

// Link plus teaser: title, date, tags and the short RSS description; never the essay text or its image.
export function parse(xml: string, now: string, pub: string): Item[] {
  return arr<any>(parseXml(xml).rss?.channel?.item).map((it) => {
    return item({
      id: idOf(it, pub),
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

// Build time only, never stored: each post's full text and photos from the feed's content:encoded (the latest posts only), keyed by item id.
// Shown on the post's own page as plain paragraphs and images, like any native post.
export function parseFull(xml: string, pub: string): Map<string, { text: string; images: string[] }> {
  return new Map(arr<any>(parseXml(xml).rss?.channel?.item).map((it) => {
    const html = txt(it["content:encoded"]);
    return [idOf(it, pub), { text: htmlToText(html), images: imagesOf(html) }];
  }));
}
export async function fullPosts(names: string[]) {
  const out = new Map<string, { text: string; images: string[] }>();
  for (const n of names) { // one at a time; a blocked feed just leaves its posts as link plus teaser
    try { const r = await get(`https://${n}.substack.com/feed`, {}); if (r) for (const [k, v] of parseFull(r.text, n)) out.set(k, v); }
    catch (e) { console.error(`::warning::substack full text (${n}): ${(e as Error).message}`); }
  }
  return out;
}

const substack: Fetcher = async (cfg, prev) => {
  const now = new Date().toISOString();
  const name = (u: string) => u.match(/^https:\/\/([^.]+)\./)![1];
  const { fresh, state } = await getEach((cfg.names as string[]).map((n) => `https://${n}.substack.com/feed`), prev);
  return { items: fresh.flatMap(([u, xml]) => parse(xml, now, name(u))), state };
};

export const required = ["names"];
export default substack;
