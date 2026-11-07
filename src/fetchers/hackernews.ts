import { item } from "../feed.ts";
import { htmlToText } from "../text.ts";
import type { Fetcher, Item } from "../types.ts";

// My stories and comments from the public HN Algolia API (no key).
export function parse(hits: any[], now: string, user: string): Item[] {
  return hits.map((h) => {
    const story = h._tags.includes("story");
    return item({
      id: `hackernews:${h.objectID}`,
      source: "hackernews",
      type: "post",
      title: story ? h.title || undefined : undefined,
      text: htmlToText(h.story_text ?? h.comment_text ?? ""),
      url: `https://news.ycombinator.com/item?id=${h.objectID}`,
      published_at: h.created_at,
      fetched_at: now,
      ...(!story && { kind: "reblog" as const }), // a comment on someone else's thread; ponytail: reuses "reblog" so it stays out of the posts view
      meta: { account: user, account_url: `https://news.ycombinator.com/user?id=${user}` },
    });
  });
}

const hackernews: Fetcher = async (cfg) => {
  const r = await fetch(`https://hn.algolia.com/api/v1/search_by_date?tags=author_${cfg.username}&hitsPerPage=100`, { signal: AbortSignal.timeout(20_000) });
  if (!r.ok) throw new Error(`hn -> HTTP ${r.status}`);
  return { items: parse((await r.json()).hits, new Date().toISOString(), cfg.username), state: {} };
};

export const required = ["username"];
export default hackernews;
