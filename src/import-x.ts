// One-off import of an X/Twitter data archive: `node src/import-x.ts <archive dir>` (the folder that contains data/tweets.js).
// Skipped: retweets (not my words) and replies to other people. My own threads are kept.
import { readFileSync } from "node:fs";
import { item } from "./feed.ts";
import { addItems } from "./store.ts";
import { decode } from "./text.ts";
import type { Item } from "./types.ts";

const cp = (s: string, a: number, b?: number) => Array.from(s).slice(a, b).join(""); // display_text_range counts code points

// "window.YTD.x.part0 = [...]" -> [...]
export const readJs = (file: string): any[] => { const s = readFileSync(file, "utf8"); return JSON.parse(s.slice(s.indexOf("["))); };

export function parseTweets(tweets: any[], notes: any[], handle: string, uid: string, now: string): Item[] {
  // Tweets over 280 characters are truncated in tweets.js; the full text (and its link list) is in note-tweet.js, matched by creation time.
  const long = new Map(notes.map((n) => [n.noteTweet.createdAt.slice(0, 19), n.noteTweet.core]));
  return tweets.map((r) => r.tweet).filter((t) => !t.full_text.startsWith("RT @") && (!t.in_reply_to_status_id_str || t.in_reply_to_user_id_str === uid)).map((t) => {
    const at = new Date(t.created_at).toISOString();
    const selfReply = !!t.in_reply_to_status_id_str;
    const [from, to] = t.display_text_range.map(Number);
    const note = long.get(at.slice(0, 19));
    let text: string = note ? note.text : cp(t.full_text, selfReply ? from : 0, to); // drop the @me in my own threads
    const links: [string, string][] = note ? note.urls.map((u: any) => [u.shortUrl, u.expandedUrl]) : t.entities.urls.map((u: any) => [u.url, u.expanded_url]);
    for (const [short, full] of links) text = text.replaceAll(short, full);
    for (const m of t.extended_entities?.media ?? t.entities.media ?? []) text = text.replaceAll(m.url, ""); // the link to my own attached photo or video
    const kinds = (t.extended_entities?.media ?? []).map((m: any) => m.type);
    const clip = kinds.includes("video") ? "video" : kinds.includes("animated_gif") ? "gif" : undefined;
    return item({
      id: `x:${t.id_str}`,
      source: "x",
      type: "post",
      text: decode(text).trim(),
      url: `https://x.com/${handle}/status/${t.id_str}`,
      published_at: at,
      fetched_at: now,
      images: (t.extended_entities?.media ?? []).filter((m: any) => m.type === "photo").map((m: any) => m.media_url_https),
      meta: {
        ...(t.in_reply_to_screen_name && { reply_to: t.in_reply_to_screen_name }),
        ...(clip && { clip }), // shown as a "video" / "gif" link back to the tweet; the file itself isn't embedded
      },
    });
  });
}

if (process.argv[1]?.endsWith("import-x.ts")) {
  const dir = process.argv[2];
  if (!dir) throw new Error("usage: node src/import-x.ts <archive dir>");
  const account = readFileSync(`${dir}/data/account.js`, "utf8");
  const handle = account.match(/"username" : "([^"]+)"/)![1], uid = account.match(/"accountId" : "(\d+)"/)![1];
  const items = parseTweets(readJs(`${dir}/data/tweets.js`), readJs(`${dir}/data/note-tweet.js`), handle, uid, new Date().toISOString());
  const kinds = Object.entries(Object.groupBy(items, (i) => i.kind)).map(([k, l]) => `${k} ${l!.length}`).join(", ");
  console.log(`x: found ${items.length} (${kinds}), added ${addItems(items).added.length}`);
}
