// One-off history import, past what the live feeds return: `node src/backfill.ts [youtube|soundcloud|quartz|github|arena]...` (default: all).
// Safe to re-run: items are deduped by id like any fetch.
import { config } from "./config.ts";
import { get, UA } from "./feed.ts";
import { nextBefore, feedUrl, parse as parseSoundcloud } from "./fetchers/soundcloud.ts";
import { addDays, commitDates, dayOf, digests, listRepos } from "./fetchers/github.ts";
import { api, channelPosts } from "./fetchers/arena.ts";
import { fromSitemap } from "./fetchers/quartz.ts";
import { parseWatch } from "./fetchers/youtube.ts";
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
  // Page dates come from the sitemap (the content index has none); see fromSitemap.
  async quartz() {
    const base = sources.quartz.site_url.replace(/\/?$/, "/");
    const [sitemap, index] = await Promise.all([get(`${base}sitemap.xml`, {}), get(`${base}static/contentIndex.json`, {})]);
    return fromSitemap(sitemap!.text, JSON.parse(index!.text), sources.quartz, now);
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
