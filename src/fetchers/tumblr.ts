import { arr, feedFetcher, iso, item, parseXml, txt } from "../feed.ts";
import { htmlToText, imagesOf } from "../text.ts";
import type { Item } from "../types.ts";

// Tumblr fills <title> with the start of the post text when no title was set (truncated with an ellipsis if long): keep only real titles.
export const realTitle = (title: string, text: string) =>
  title && !text.startsWith(title.replace(/(…|\.\.\.)$/, "")) ? title : undefined;

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

export default feedFetcher((c) => `https://${c.username}.tumblr.com/rss`, parse);
export const required = ["username"];
