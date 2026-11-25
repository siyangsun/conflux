import { config } from "../config.ts";
import type { Fetcher, Item } from "../types.ts";
import { clientId, parseLikes } from "./soundcloud.ts";

// Likes of the main account (the unofficial web API, see clientId), as reblogs dated when I liked them. Likes of my own music are skipped.
// Daily: scheduled runs only in the 13:07 UTC slot, manual runs always, pushes never. Cursor = newest like's created_at; pages go back to it (or one page on the first run).
const likes: Fetcher = async (cfg, prev) => {
  const ev = process.env.GITHUB_EVENT_NAME, d = new Date();
  if (ev === "push" || (ev === "schedule" && !(d.getUTCHours() === 13 && d.getUTCMinutes() < 20))) return { items: [], state: {} };
  const cid = await clientId();
  const items: Item[] = [];
  let cursor = prev.cursor, first = true;
  for (let url: string | undefined = `https://api-v2.soundcloud.com/users/${cfg.user_id}/track_likes?client_id=${cid}&limit=50&linked_partitioning=1`; url; first = false) {
    const res = await fetch(url, { headers: { "user-agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(20_000) });
    if (!res.ok) throw new Error(`soundcloud likes -> HTTP ${res.status}`);
    const { collection, next_href }: any = await res.json();
    if (!collection.length) break;
    items.push(...parseLikes(collection, d.toISOString(), config.sources.soundcloud.user_ids));
    if (first) cursor = collection[0].created_at; // newest like
    url = prev.cursor && next_href && collection.at(-1).created_at > prev.cursor ? `${next_href}&client_id=${cid}` : undefined;
  }
  return { items, state: { cursor } };
};

export default likes;
export const required = ["user_id"];
