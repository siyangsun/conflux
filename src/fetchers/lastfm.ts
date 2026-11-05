import { arr, item, UA } from "../feed.ts";
import { hash } from "../text.ts";
import type { Fetcher, Item } from "../types.ts";

// Loved tracks via the Last.fm API (user.getLovedTracks, read-only: needs LASTFM_API_KEY, not the shared secret).
// They are other people's music that I saved, so they are reblogs, dated by when I loved them.
export function parse(res: any, now: string): Item[] {
  return arr<any>(res.lovedtracks?.track).map((t) => item({
    id: `lastfm:${hash(t.url)}`,
    source: "lastfm",
    type: "audio",
    kind: "reblog",
    title: `${t.artist.name} – ${t.name}`,
    text: "",
    url: t.url,
    published_at: new Date(Number(t.date.uts) * 1000).toISOString(),
    fetched_at: now,
    meta: { artist: t.artist.name },
  }));
}

export async function page(username: string, n: number, limit: number) {
  const key = process.env.LASTFM_API_KEY;
  if (!key) throw new Error("LASTFM_API_KEY is not set");
  const q = new URLSearchParams({ method: "user.getLovedTracks", user: username, api_key: key, format: "json", limit: String(limit), page: String(n) });
  const res = await fetch(`https://ws.audioscrobbler.com/2.0/?${q}`, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`lastfm -> HTTP ${res.status}`); // not the URL: it contains the key
  return res.json() as Promise<any>;
}

// Each run reads the newest 50 loves; backfill (src/backfill.ts) pages through all of them.
const lastfm: Fetcher = async (cfg) => ({ items: parse(await page(cfg.username, 1, 50), new Date().toISOString()), state: {} });
export default lastfm;
export const required = ["username"];
