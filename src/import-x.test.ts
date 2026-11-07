import { test } from "node:test";
import assert from "node:assert/strict";
import { parseTweets } from "./import-x.ts";

const base = { created_at: "Wed Nov 04 20:30:14 +0000 2026", entities: { urls: [] }, display_text_range: ["0", "5"] };
const tw = (o: any) => ({ tweet: { ...base, id_str: "1", full_text: "hello", ...o } });

test("x archive: originals, threads, replies, retweets, links, long tweets", () => {
  const out = parseTweets([
    tw({}),
    tw({ id_str: "2", full_text: "@me a &amp; b", display_text_range: ["4", "13"], in_reply_to_status_id_str: "1", in_reply_to_user_id_str: "9", in_reply_to_screen_name: "me" }),
    tw({ id_str: "3", full_text: "@me more", display_text_range: ["4", "8"], in_reply_to_status_id_str: "1", in_reply_to_user_id_str: "7" }),
    tw({ id_str: "4", full_text: "RT @x: nope" }),
    tw({ id_str: "5", full_text: "see https://t.co/a", display_text_range: ["0", "18"], entities: { urls: [{ url: "https://t.co/a", expanded_url: "https://example.com" }] } }),
    tw({ id_str: "6", full_text: "cut off…", created_at: "Wed Nov 04 21:00:00 +0000 2026" }),
  ], [{ noteTweet: { createdAt: "2026-11-04T21:00:00.000Z", core: { text: "the full long text https://t.co/n", urls: [{ shortUrl: "https://t.co/n", expandedUrl: "https://example.org/n" }] } } }], "me", "7", "2026-11-05T00:00:00Z");
  assert.deepEqual(out.map((i) => [i.id, i.kind]), [["x:1", "post"], ["x:3", "post"], ["x:5", "post"], ["x:6", "post"]]);
  assert.equal(out[1].text, "more"); // own thread drops the @me; reply to someone else (x:2) and retweet (x:4) are skipped
  assert.equal(out[2].text, "see https://example.com");
  assert.equal(out[3].text, "the full long text https://example.org/n"); // note tweet shares the timestamp with tweet 6
  assert.equal(out[0].text, "hello");
  assert.equal(parseTweets([tw({ extended_entities: { media: [{ type: "animated_gif" }] } })], [], "me", "7", "n")[0].meta.clip, "gif");
  assert.equal(out[0].url, "https://x.com/me/status/1");
  const pic = parseTweets([tw({ full_text: "look https://t.co/pic", display_text_range: ["0", "21"], extended_entities: { media: [{ type: "photo", url: "https://t.co/pic" }] } })], [], "me", "7", "n")[0];
  assert.equal(pic.text, "look"); // the link to my own attached photo is dropped
});
