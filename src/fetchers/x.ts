import { item, UA } from "../feed.ts";
import type { Fetcher, Item } from "../types.ts";

export function parse(res: any, handle: string, now: string): Item[] {
  const media = new Map<string, any>((res.includes?.media ?? []).map((m: any) => [m.media_key, m]));
  return (res.data ?? []).map((t: any): Item => item({
    id: `x:${t.id}`,
    source: "x",
    type: "post",
    text: t.text,
    url: `https://x.com/${handle}/status/${t.id}`,
    published_at: new Date(t.created_at).toISOString(),
    fetched_at: now,
    images: (t.attachments?.media_keys ?? []).map((k: string) => media.get(k)).filter((m: any) => m?.type === "photo").map((m: any) => m.url),
  }));
}

// Disabled by default (paid API). Cursor = since_id; replies and reposts are excluded.
const x: Fetcher = async (cfg, prev) => {
  if (!process.env.X_BEARER_TOKEN) throw new Error("X_BEARER_TOKEN is not set");
  const q = new URLSearchParams({
    max_results: "100",
    exclude: "replies,retweets",
    "tweet.fields": "created_at,attachments",
    expansions: "attachments.media_keys",
    "media.fields": "url,type",
  });
  if (prev.cursor) q.set("since_id", prev.cursor);
  const res = await fetch(`https://api.x.com/2/users/${cfg.user_id}/tweets?${q}`, {
    headers: { "user-agent": UA, authorization: `Bearer ${process.env.X_BEARER_TOKEN}` },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`x -> HTTP ${res.status}`);
  const json: any = await res.json();
  return { items: parse(json, cfg.handle, new Date().toISOString()), state: { cursor: json.meta?.newest_id ?? prev.cursor } };
};

export default x;
export const required = ["handle", "user_id"];
