import { arr, item, UA } from "../feed.ts";
import { hash } from "../text.ts";
import { addDays, dayOf } from "./github.ts";
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

async function call(method: string, params: Record<string, string>): Promise<any> {
  const key = process.env.LASTFM_API_KEY;
  if (!key) throw new Error("LASTFM_API_KEY is not set");
  const q = new URLSearchParams({ method, api_key: key, format: "json", ...params });
  const res = await fetch(`https://ws.audioscrobbler.com/2.0/?${q}`, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`lastfm -> HTTP ${res.status}`); // not the URL: it contains the key
  return res.json();
}
export const page = (username: string, n: number, limit: number) => call("user.getLovedTracks", { user: username, limit: String(limit), page: String(n) });

// Every scrobble since `from` (unix seconds; default: all), newest first, 200 per request.
export async function allPlays(username: string, from?: number): Promise<any[]> {
  const out: any[] = [];
  for (let n = 1, pages = 1; n <= pages; n++) {
    const r = (await call("user.getRecentTracks", { user: username, limit: "200", page: String(n), ...(from && { from: String(from) }) })).recenttracks;
    pages = Number(r?.["@attr"]?.totalPages ?? 0);
    out.push(...arr<any>(r?.track));
    if (n > 1) await new Promise((res) => setTimeout(res, 250));
  }
  return out;
}

// One entry per finished New York day (from..to inclusive) with plays: every track played that day in listening order, "Artist – Track ×N" for repeats.
export function playDigests(tracks: any[], user: string, from: string, to: string, now: string): Item[] {
  const days = new Map<string, { last: string; n: number; songs: Map<string, number> }>();
  for (const t of [...tracks].reverse()) { // input is newest first; walk oldest first so a repeat keeps its first position
    if (!t.date) continue; // the track playing right now has no date
    const at = new Date(Number(t.date.uts) * 1000).toISOString(), day = dayOf(at);
    if (day < from || day > to) continue;
    const d = days.get(day) ?? days.set(day, { last: at, n: 0, songs: new Map() }).get(day)!;
    if (at > d.last) d.last = at;
    d.n++;
    const song = `${t.artist["#text"] ?? t.artist.name} – ${t.name}`;
    d.songs.set(song, (d.songs.get(song) ?? 0) + 1);
  }
  return [...days].map(([day, d]) => item({
    id: `lastfm:plays:${day}`,
    source: "lastfm",
    type: "audio",
    kind: "activity",
    title: `Listened to ${d.n} track${d.n > 1 ? "s" : ""}`,
    text: [...d.songs].map(([song, c]) => (c > 1 ? `${song} ×${c}` : song)).join("\n"),
    url: `https://www.last.fm/user/${user}/library?from=${day}&to=${day}`,
    published_at: d.last,
    fetched_at: now,
  }));
}

// Each run reads the newest 50 loves, plus the rollup of any finished days since the cursor (src/backfill.ts does the whole history).
// The cursor is only saved when something else made the run commit, which is fine: re-checking is cheap.
const lastfm: Fetcher = async (cfg, prev) => {
  const now = new Date().toISOString(), yesterday = addDays(dayOf(now), -1);
  const items = parse(await page(cfg.username, 1, 50), now);
  const from = prev.cursor ? addDays(prev.cursor, 1) : yesterday;
  if (from <= yesterday) {
    const since = Date.parse(`${addDays(from, -1)}T00:00:00Z`) / 1000; // a day early; playDigests filters by New York day
    items.push(...playDigests(await allPlays(cfg.username, since), cfg.username, from, yesterday, now));
  }
  return { items, state: { cursor: yesterday } };
};
export default lastfm;
export const required = ["username"];
