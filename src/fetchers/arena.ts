import { item, UA } from "../feed.ts";
import type { Fetcher, Item } from "../types.ts";

const API = "https://api.are.na/v3";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Guests get 30 requests/minute: on 429, wait out retry-after (max 3 times) instead of failing the run.
export async function api(path: string, tries = 3): Promise<any> {
  const headers: Record<string, string> = { "user-agent": UA };
  if (process.env.ARENA_TOKEN) headers.authorization = `Bearer ${process.env.ARENA_TOKEN}`;
  const res = await fetch(API + path, { headers, signal: AbortSignal.timeout(20_000) });
  if (res.status === 429 && tries > 1) {
    await sleep(Math.min(Number(res.headers.get("retry-after")) || 30, 65) * 1000);
    return api(path, tries - 1);
  }
  if (!res.ok) throw new Error(`are.na ${path} -> HTTP ${res.status}`);
  return res.json();
}

// One item per connection (a block added to a second channel is a new item). Only blocks I connected, only public ones.
export function parse(blocks: any[], channel: any, me: number, now: string): Item[] {
  return blocks.flatMap((b): Item[] => {
    const c = b.connection;
    if (c?.connected_by?.id !== me || b.visibility !== "public" || b.state !== "available") return [];
    const text = [b.content?.plain, b.description?.plain].filter(Boolean).join("\n\n");
    return [item({
      id: `arena:${c.id}`,
      source: "arena",
      kind: "reblog",
      type: "block",
      title: b.title || undefined,
      text,
      url: `https://www.are.na/block/${b.id}`,
      published_at: new Date(c.connected_at).toISOString(),
      fetched_at: now,
      images: b.image?.src ? [b.image.src] : [],
      meta: {
        block_type: b.type,
        source_url: b.source?.url,
        channel: { title: channel.title, url: `https://www.are.na/${channel.owner?.slug ?? ""}/${channel.slug}` },
      },
    })];
  });
}

// Creating a channel is a post of its own (one per channel, dated by creation). Only channels I own; private ones are skipped.
export const channelPosts = (channels: any[], me: number, now: string): Item[] =>
  channels.filter((c) => c.visibility !== "private" && c.owner?.id === me).map((c) => item({
    id: `arena:channel:${c.id}`,
    source: "arena",
    type: "channel",
    title: c.title,
    text: c.description?.plain ?? "",
    url: `https://www.are.na/${c.owner.slug}/${c.slug}`,
    published_at: new Date(c.created_at).toISOString(),
    fetched_at: now,
  }));

// Channels changed since the cursor, and the new cursor (the newest updated_at seen). Independent of list order:
// Are.na's updated_at_desc sort returns each page oldest-first, so "first item" is not "newest".
export function sinceCursor(channels: any[], cursor?: string) {
  const open = channels.filter((c) => c.visibility !== "private" && (!cursor || c.updated_at > cursor));
  const newest = channels.reduce((m: string, c) => (c.updated_at > m ? c.updated_at : m), cursor ?? "");
  return { open, cursor: newest || undefined };
}

const arena: Fetcher = async (cfg, prev) => {
  const me = (await api(`/users/${cfg.username}`)).id as number;
  // ponytail: all channel pages every run (2 requests at ~160 channels); the order isn't reliable enough to stop early.
  const channels: any[] = [];
  for (let page = 1; ; page++) {
    const r = await api(`/users/${cfg.username}/contents?type=Channel&per=100&page=${page}`);
    channels.push(...r.data);
    if (!r.meta.has_more_pages) break;
  }
  const { open, cursor } = sinceCursor(channels, prev.cursor);
  const now = new Date().toISOString();
  const items: Item[] = channelPosts(channels, me, now); // deduped by id, so re-listing old channels is harmless
  for (const ch of open) {
    // ponytail: page 1 only, newest position first; reordering a channel by hand or >100 adds between runs can miss items. Deep history: one-off backfill script.
    const r = await api(`/channels/${ch.id}/contents?user_id=${me}&sort=position_desc&per=100`);
    items.push(...parse(r.data, ch, me, now));
  }
  // persist: a moved cursor must be saved even when nothing new was added, or the same channels get re-read next run.
  return { items, state: { cursor }, persist: cursor !== prev.cursor };
};

export const required = ["username"];
export default arena;
