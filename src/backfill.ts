// One-off history import, past what the live feeds return: `node src/backfill.ts [youtube|soundcloud|quartz|github|arena|tumblr|lastfm]...` (default: all except the one-off fixes `arena-own` and `lastfm-format`, which you name explicitly).
// Safe to re-run: items are deduped by id like any fetch.
import { execFileSync } from "node:child_process";
import { config } from "./config.ts";
import { get, UA } from "./feed.ts";
import { clientId, parseApi as parseSoundcloudApi, parseLikes } from "./fetchers/soundcloud.ts";
import { addDays, commitDates, dayOf, digests, listRepos } from "./fetchers/github.ts";
import { api, channelPosts, parse as parseArena } from "./fetchers/arena.ts";
import { fromHistory } from "./fetchers/quartz.ts";
import { parseWatch } from "./fetchers/youtube.ts";
import { parseApi as parseTumblr } from "./fetchers/tumblr.ts";
import { allPlays, page as lastfmPage, parse as parseLastfm, playDigests } from "./fetchers/lastfm.ts";
import { addItems, loadAll, update } from "./store.ts";
import type { Item } from "./types.ts";

const sources = config.sources;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const now = new Date().toISOString();

const jobs: Record<string, () => Promise<Item[]>> = {
  // The channel's /videos page lists every video id (first ~30); the ones the 15-item RSS lacks are read from their watch page.
  async youtube() {
    const stored = new Set(loadAll().map((i) => i.id));
    const page = await (await fetch(`https://www.youtube.com/channel/${sources.youtube.channel_id}/videos`, { headers: { "user-agent": UA, "accept-language": "en-US" } })).text();
    const ids = [...new Set([...page.matchAll(/"contentId":"([\w-]{11})"/g)].map((m) => m[1]))].filter((id) => !stored.has(`youtube:${id}`));
    const out: Item[] = [];
    for (const id of ids) {
      const html = await (await fetch(`https://www.youtube.com/watch?v=${id}`, { headers: { "user-agent": "Mozilla/5.0", "accept-language": "en-US" } })).text();
      out.push(parseWatch(html, id, now));
      await sleep(300);
    }
    return out;
  },
  // Page dates come from the content repo's git history (the content index has none): git clone it, then QUARTZ_DIR=<clone> node src/backfill.ts quartz
  async quartz() {
    const dir = process.env.QUARTZ_DIR;
    if (!dir) throw new Error("set QUARTZ_DIR to a clone of the Quartz content repo");
    const index = JSON.parse((await get(`${sources.quartz.site_url.replace(/\/?$/, "/")}static/contentIndex.json`, {}))!.text);
    const history = Object.fromEntries(Object.values<any>(index).map((p) =>
      [p.slug, execFileSync("git", ["-C", dir, "log", "--follow", "--format=%aI", "--", `content/${p.filePath}`], { encoding: "utf8" }).split("\n").filter(Boolean).reverse()]));
    return fromHistory(history, index, sources.quartz, now);
  },
  // Every finished day of commit history (the live fetcher only handles yesterday onward). Needs ~1 API call per 100 commits per repo:
  // set GITHUB_TOKEN if unauthenticated limits (60/hour) run out.
  async github() {
    const cfg = sources.github, now = new Date().toISOString();
    const active = [];
    for (const repo of await listRepos(cfg)) active.push({ repo, dates: await commitDates(cfg.username, repo.name) });
    return digests(active, cfg.username, "0000-00-00", addDays(dayOf(now), -1), now);
  },
  // Every channel I own, as a "created a new channel" post (the live fetcher only sees the most recently updated 100).
  async arena() {
    const me = (await api(`/users/${sources.arena.username}`)).id as number;
    const channels: any[] = [];
    for (let page = 1; ; page++) {
      const r = await api(`/users/${sources.arena.username}/contents?type=Channel&per=100&page=${page}`);
      channels.push(...r.data);
      if (!r.meta.has_more_pages) break;
    }
    return channelPosts(channels, me, now);
  },
  // Flags existing Are.na items for blocks I created (meta.own), so they read "posted to" not "saved to". Every page of every channel; ~1 request per 100 blocks.
  async "arena-own"() {
    const me = (await api(`/users/${sources.arena.username}`)).id as number;
    const own = new Set<string>();
    for (let cp = 1, more = true; more; cp++) {
      const r = await api(`/users/${sources.arena.username}/contents?type=Channel&per=100&page=${cp}`);
      more = r.meta.has_more_pages;
      for (const ch of r.data.filter((c: any) => c.visibility !== "private")) {
        for (let page = 1, next = true; next; page++) {
          const b = await api(`/channels/${ch.id}/contents?user_id=${me}&per=100&page=${page}`);
          next = b.meta?.has_more_pages;
          for (const i of parseArena(b.data, ch, me, now)) if (i.meta.own) own.add(i.id);
        }
      }
    }
    // update() replaces meta wholesale, so merge per item (ponytail: reloads the store each time; fine for a one-off)
    const stored = new Map(loadAll().map((i) => [i.id, i]));
    let n = 0;
    for (const id of own) if (stored.has(id)) n += update(new Set([id]), { meta: { ...stored.get(id)!.meta, own: true } });
    console.log(`arena-own: flagged ${n} of ${own.size}`);
    return [];
  },
  // Offline: rewrites old digest text ("Artist (3): a, b ×2") into the new format without refetching. Songs are split only when the per-song counts add up to the
  // artist's count (a comma inside a title always overshoots), else they stay inline. No rev is set, so a real `lastfm` backfill still replaces these.
  async "lastfm-format"() {
    const convert = (line: string) => {
      const m = line.match(/^(.+?) \((\d+)\): (.+)$/);
      if (!m) return line;
      const parts = m[3].split(", ").map((p) => p.match(/^(.*) ×(\d+)$/) ?? [p, p, "1"]);
      const song = (p: string[]) => (+p[2] > 1 ? `${p[1]} (${p[2]})` : p[1]);
      if (parts.length === 1) return `**${m[1]}** (${m[2]}): ${parts[0][1]}`;
      if (parts.reduce((n, p) => n + +p[2], 0) === +m[2]) return `**${m[1]}** (${m[2]})` + parts.map((p) => `\n- ${song(p)}`).join("");
      return `**${m[1]}** (${m[2]}): ${m[3].replace(/ ×(\d+)/g, " ($1)")}`;
    };
    let n = 0;
    for (const i of loadAll().filter((i) => i.id.startsWith("lastfm:plays:") && !i.rev && !i.text.startsWith("**"))) n += update(new Set([i.id]), { text: i.text.split("\n").map(convert).join("\n") });
    console.log(`lastfm-format: converted ${n}`);
    return [];
  },
  // Every post via the Tumblr API, 20 per request (the RSS feed stops at ~20). Needs TUMBLR_API_KEY in the environment (your OAuth consumer key; never commit it).
  // TUMBLR_BLOG=<name> imports another blog of mine instead, reblogs only (a one-off for an old blog: nothing is added to the config or the live fetch).
  async tumblr() {
    const key = process.env.TUMBLR_API_KEY, blog = process.env.TUMBLR_BLOG ?? sources.tumblr.username;
    if (!key) throw new Error("set TUMBLR_API_KEY");
    const out: Item[] = [];
    for (let offset = 0, total = 1; offset < total; offset += 20) {
      const res = await fetch(`https://api.tumblr.com/v2/blog/${blog}.tumblr.com/posts?api_key=${key}&reblog_info=true&limit=20&offset=${offset}`, { headers: { "user-agent": UA } });
      if (!res.ok) throw new Error(`tumblr API -> HTTP ${res.status}`); // not the URL: it contains the key
      const r = (await res.json()).response;
      total = r.total_posts;
      out.push(...parseTumblr(r.posts, now));
      await sleep(300);
    }
    return process.env.TUMBLR_BLOG ? out.filter((i) => i.kind === "reblog") : out;
  },
  // Every loved track (200 per request) and a daily rollup of all scrobbles. Needs LASTFM_API_KEY in the environment.
  async lastfm() {
    const out: Item[] = [];
    for (let n = 1, pages = 1; n <= pages; n++) {
      const r = await lastfmPage(sources.lastfm.username, n, 200);
      pages = Number(r.lovedtracks["@attr"].totalPages);
      out.push(...parseLastfm(r, now));
    }
    // ...and a rollup for every finished day of scrobbles (one request per 200 plays).
    out.push(...playDigests(await allPlays(sources.lastfm.username), sources.lastfm.username, "0000-00-00", addDays(dayOf(now), -1), now));
    return out;
  },
  // The RSS only lists tracks uploaded with "include in RSS feed" on, so history comes from the web API (uploads, then likes).
  async soundcloud() {
    const cid = await clientId();
    const out: Item[] = [], ids = sources.soundcloud.user_ids as string[];
    for (const id of ids) {
      // likes: the first (main) account only
      for (const [path, parse] of [["tracks", parseSoundcloudApi], ...(id === ids[0] ? [["track_likes", (l: any[], t: string) => parseLikes(l, t, ids)] as const] : [])] as const) {
        for (let url: string | undefined = `https://api-v2.soundcloud.com/users/${id}/${path}?client_id=${cid}&limit=50&linked_partitioning=1`; url; ) {
          const r: any = await (await fetch(url, { headers: { "user-agent": "Mozilla/5.0" } })).json();
          out.push(...parse(r.collection, now));
          url = r.next_href && `${r.next_href}&client_id=${cid}`;
          await sleep(300);
        }
      }
    }
    return out;
  },
};

const oneOff = ["arena-own", "lastfm-format"];
for (const name of process.argv.length > 2 ? process.argv.slice(2) : Object.keys(jobs).filter((n) => !oneOff.includes(n))) {
  const items = await jobs[name]();
  console.log(`${name}: found ${items.length}, added ${addItems(items).added.length}`);
}
