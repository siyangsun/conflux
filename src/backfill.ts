// One-off history import, past what the live feeds return: `node src/backfill.ts [youtube|soundcloud|quartz|github|arena|tumblr]...` (default: all).
// Safe to re-run: items are deduped by id like any fetch.
import { execFileSync } from "node:child_process";
import { config } from "./config.ts";
import { get, UA } from "./feed.ts";
import { nextBefore, feedUrl, parse as parseSoundcloud } from "./fetchers/soundcloud.ts";
import { addDays, commitDates, dayOf, digests, listRepos } from "./fetchers/github.ts";
import { api, channelPosts } from "./fetchers/arena.ts";
import { fromHistory } from "./fetchers/quartz.ts";
import { parseWatch } from "./fetchers/youtube.ts";
import { parseApi as parseTumblr } from "./fetchers/tumblr.ts";
import { addItems, loadAll } from "./store.ts";
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
  // Every post via the Tumblr API, 20 per request (the RSS feed stops at ~20). Needs TUMBLR_API_KEY in the environment (your OAuth consumer key; never commit it).
  async tumblr() {
    const key = process.env.TUMBLR_API_KEY;
    if (!key) throw new Error("set TUMBLR_API_KEY");
    const out: Item[] = [];
    for (let offset = 0, total = 1; offset < total; offset += 20) {
      const res = await fetch(`https://api.tumblr.com/v2/blog/${sources.tumblr.username}.tumblr.com/posts?api_key=${key}&reblog_info=true&limit=20&offset=${offset}`, { headers: { "user-agent": UA } });
      if (!res.ok) throw new Error(`tumblr API -> HTTP ${res.status}`); // not the URL: it contains the key
      const r = (await res.json()).response;
      total = r.total_posts;
      out.push(...parseTumblr(r.posts, now));
      await sleep(300);
    }
    return out;
  },
  // Follow each account's rel="next" chain to the oldest track.
  async soundcloud() {
    const out: Item[] = [];
    for (const id of sources.soundcloud.user_ids as string[]) {
      for (let before: string | undefined; ; ) {
        const r = await get(feedUrl(id, before), {});
        out.push(...parseSoundcloud(r!.text, now));
        before = nextBefore(r!.text);
        if (!before) break;
        await sleep(300);
      }
    }
    return out;
  },
};

for (const name of process.argv.length > 2 ? process.argv.slice(2) : Object.keys(jobs)) {
  const items = await jobs[name]();
  console.log(`${name}: found ${items.length}, added ${addItems(items).added.length}`);
}
