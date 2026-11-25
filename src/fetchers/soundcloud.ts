import { arr, getEach, iso, item, parseXml, txt } from "../feed.ts";
import type { Fetcher, Item } from "../types.ts";

// SoundCloud's public RSS lists the latest tracks (the feed has empty <item> filler, skipped here).
// Its description is always "<title> by <artist>", so no body text is stored; the player is the content.
export function parse(xml: string, now: string): Item[] {
  return arr<any>(parseXml(xml).rss?.channel?.item).flatMap((it): Item[] => {
    const url = txt(it.link);
    const account = url.split("/")[3]; // soundcloud.com/<account>/<track>
    const id = txt(it.guid).match(/tracks\/(\d+)/)?.[1];
    if (!url || !id) return [];
    return [item({
      id: `soundcloud:${id}`,
      source: "soundcloud",
      type: "audio",
      title: txt(it.title) || undefined,
      text: "",
      url,
      published_at: iso(txt(it.pubDate)),
      fetched_at: now,
      meta: { account, account_url: `https://soundcloud.com/${account}` },
      embed: { provider: "soundcloud", id: `https://w.soundcloud.com/player/?url=${encodeURIComponent(url)}` },
    })];
  });
}

// Backfill: tracks from SoundCloud's web API (public tracks only), same item shape as the RSS parser.
export const parseApi = (tracks: any[], now: string): Item[] => tracks.filter((t) => t.kind === "track" && t.public).map((t) => item({
  id: `soundcloud:${t.id}`,
  source: "soundcloud",
  type: "audio",
  title: t.title || undefined,
  text: "",
  url: t.permalink_url,
  published_at: iso(t.created_at),
  fetched_at: now,
  meta: { account: t.permalink_url.split("/")[3], account_url: `https://soundcloud.com/${t.permalink_url.split("/")[3]}` },
  embed: { provider: "soundcloud", id: `https://w.soundcloud.com/player/?url=${encodeURIComponent(t.permalink_url)}` },
}));

// Backfill: a user's likes (api-v2 track_likes). Each entry has its own created_at, the date I liked it; stored as a reblog dated then.
// Likes of my own music (uploaded by any account in `mine`) are skipped: the upload itself is already an item.
export const parseLikes = (likes: any[], now: string, mine: string[] = []): Item[] =>
  likes.filter((l) => l.track && !mine.includes(String(l.track.user_id))).flatMap((l) => parseApi([l.track], now).map((i): Item => ({ ...i, kind: "reblog", published_at: iso(l.created_at) })));

// ponytail: client_id is scraped from soundcloud.com's own JS (no official key); if SoundCloud changes that, this breaks.
export async function clientId(): Promise<string> {
  const html = await (await fetch("https://soundcloud.com/", { headers: { "user-agent": "Mozilla/5.0" } })).text();
  for (const src of html.match(/https:\/\/a-v2\.sndcdn\.com\/assets\/[^"]*\.js/g) ?? []) {
    const cid = (await (await fetch(src)).text()).match(/client_id:"(\w{32})"/)?.[1];
    if (cid) return cid;
  }
  throw new Error("could not find a SoundCloud client_id");
}

export const feedUrl = (userId: string, before?: string) =>
  `https://feeds.soundcloud.com/users/soundcloud:users:${userId}/sounds.rss${before ? `?before=${before}` : ""}`;
const soundcloud: Fetcher = async (cfg, prev) => {
  const now = new Date().toISOString();
  const { fresh, state } = await getEach((cfg.user_ids as string[]).map((id) => feedUrl(id)), prev);
  return { items: fresh.flatMap(([, xml]) => parse(xml, now)), state };
};

export const required = ["user_ids"];
export default soundcloud;
