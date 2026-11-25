import { arr, feedFetcher, fromMeta, iso, item, parseXml, realTitle, txt } from "../feed.ts";
import { hash, htmlToText, imagesOf } from "../text.ts";
import type { Item } from "../types.ts";

export { realTitle };

// A reblog keeps my own comment first, then the reblogged post's text and images, with "from @blog" shown above (meta.account).
const attribution = /<p><a [^>]*class="tumblr_blog"[^>]*>[^<]*<\/a>:<\/p>/g; // "<blog>:" lines that head each quoted post
const withTheirs = (mine: string, theirs: string) => [mine, htmlToText(theirs.replace(attribution, ""))].filter(Boolean).join("\n\n");

export function parse(xml: string, now: string): Item[] {
  return arr<any>(parseXml(xml).rss?.channel?.item).flatMap((it): Item[] => {
    const html = txt(it.description);
    const from = html.match(/class="tumblr_blog"[^>]*>([^<]*)</)?.[1];
    const reblog = from !== undefined;
    const end = html.lastIndexOf("</blockquote>");
    const mine = reblog && end >= 0 ? html.slice(end + "</blockquote>".length) : html;
    const theirs = reblog && end >= 0 ? html.slice(html.indexOf("<blockquote"), end) : "";
    const text = reblog ? withTheirs(htmlToText(end < 0 ? "" : mine), theirs) : htmlToText(mine);
    const images = imagesOf(reblog ? theirs : html);
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
      images,
      tags: arr<any>(it.category).map(txt),
      ...(reblog && { kind: "reblog" as const }),
      ...(reblog && { rev: hash(text + images.join()) }), // a changed parse replaces the stored reblog
      meta: reblog ? fromMeta(from, `https://${from}.tumblr.com`) : {},
    })];
  });
}

// Backfill: posts from the Tumblr API (v2, legacy format, reblog_info=true). Same rules as the RSS parser.
export function parseApi(posts: any[], now: string): Item[] {
  return posts.map((p): Item => {
    const from: string | undefined = p.reblogged_from_name;
    const html: string = p.body ?? p.caption ?? p.description ?? "";
    const mine = htmlToText(from ? (p.reblog?.comment ?? "") : html), theirs: string = from ? (p.reblog?.tree_html ?? "") : "";
    const photos: string[] = (p.photos ?? []).map((ph: any) => ph.original_size.url);
    const text = from ? withTheirs(mine, theirs) : mine;
    const images = from ? (imagesOf(theirs).length ? imagesOf(theirs) : photos) : photos.length ? photos : imagesOf(html); // text posts carry their pictures as <img> in the body
    return item({
      id: `tumblr:${p.id_string}`,
      source: "tumblr",
      type: "post",
      title: !from && p.title ? p.title : undefined,
      text,
      url: p.post_url,
      published_at: new Date(p.timestamp * 1000).toISOString(),
      fetched_at: now,
      images,
      tags: p.tags ?? [],
      ...(from && { kind: "reblog" as const, rev: hash(text + images.join()) }),
      meta: from ? fromMeta(from, `https://${from}.tumblr.com`) : {},
    });
  });
}

export default feedFetcher((c) => `https://${c.username}.tumblr.com/rss`, parse);
export const required = ["username"];
