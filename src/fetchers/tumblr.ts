import { arr, feedFetcher, iso, item, parseXml, realTitle, txt } from "../feed.ts";
import { htmlToText, imagesOf } from "../text.ts";
import type { Item } from "../types.ts";

export { realTitle };

// Reblogs: archive only the link and my own added comment, never the original author's text or images.
export function parse(xml: string, now: string): Item[] {
  return arr<any>(parseXml(xml).rss?.channel?.item).flatMap((it): Item[] => {
    const html = txt(it.description);
    const from = html.match(/class="tumblr_blog"[^>]*>([^<]*)</)?.[1];
    const reblog = from !== undefined;
    const end = html.lastIndexOf("</blockquote>");
    const mine = reblog && end >= 0 ? html.slice(end + "</blockquote>".length) : html;
    const text = htmlToText(reblog && end < 0 ? "" : mine) || (reblog ? `Reblogged from ${from}` : "");
    const id = (txt(it.guid) + " " + txt(it.link)).match(/\/post\/(\d+)/)?.[1];
    if (!id) return [];
    return [item({
      id: `tumblr:${id}`,
      source: "tumblr",
      type: "post",
      title: realTitle(txt(it.title).trim(), text),
      text,
      url: txt(it.link),
      published_at: iso(txt(it.pubDate)),
      fetched_at: now,
      images: reblog ? [] : imagesOf(html),
      tags: arr<any>(it.category).map(txt),
      ...(reblog && { kind: "reblog" as const }),
      meta: reblog ? { reblog_from: from } : {},
    })];
  });
}

// Backfill: posts from the Tumblr API (v2, legacy format, reblog_info=true). Same rules as the RSS parser: a reblog keeps only my own comment.
export function parseApi(posts: any[], now: string): Item[] {
  return posts.map((p): Item => {
    const from: string | undefined = p.reblogged_from_name;
    const html: string = p.body ?? p.caption ?? p.description ?? "";
    const mine = htmlToText(from ? (p.reblog?.comment ?? "") : html);
    const photos: string[] = (p.photos ?? []).map((ph: any) => ph.original_size.url);
    return item({
      id: `tumblr:${p.id_string}`,
      source: "tumblr",
      type: "post",
      title: !from && p.title ? p.title : undefined,
      text: from ? mine || `Reblogged from ${from}` : mine,
      url: p.post_url,
      published_at: new Date(p.timestamp * 1000).toISOString(),
      fetched_at: now,
      images: from ? [] : photos.length ? photos : imagesOf(html), // text posts carry their pictures as <img> in the body
      tags: p.tags ?? [],
      ...(from && { kind: "reblog" as const }),
      meta: from ? { reblog_from: from } : {},
    });
  });
}

export default feedFetcher((c) => `https://${c.username}.tumblr.com/rss`, parse);
export const required = ["username"];
