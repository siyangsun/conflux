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

export const feedUrl = (userId: string, before?: string) =>
  `https://feeds.soundcloud.com/users/soundcloud:users:${userId}/sounds.rss${before ? `?before=${before}` : ""}`;
// Each feed page links to the next-older one: <atom:link href="...?before=ID" rel="next">.
export const nextBefore = (xml: string) => xml.match(/\?before=(\d+)"\s+rel="next"/)?.[1];

const soundcloud: Fetcher = async (cfg, prev) => {
  const now = new Date().toISOString();
  const { fresh, state } = await getEach((cfg.user_ids as string[]).map((id) => feedUrl(id)), prev);
  return { items: fresh.flatMap(([, xml]) => parse(xml, now)), state };
};

export const required = ["user_ids"];
export default soundcloud;
