import { item, UA } from "../feed.ts";
import type { Fetcher, Item } from "../types.ts";

type Repo = { name: string; html_url: string; description: string | null; created_at: string; pushed_at: string; fork: boolean };

// ponytail: first 100 repos only; page the list if you ever pass that.
async function api(path: string): Promise<any> {
  const headers: Record<string, string> = { "user-agent": UA, accept: "application/vnd.github+json" };
  if (process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const res = await fetch(`https://api.github.com${path}`, { headers, signal: AbortSignal.timeout(20_000) });
  if (res.status === 409) return []; // empty repository
  if (!res.ok) throw new Error(`github ${path} -> HTTP ${res.status}${res.headers.get("x-ratelimit-remaining") === "0" ? " (rate limited)" : ""}`);
  return res.json();
}

// Days are New York days, matching how the site shows dates.
const NY = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }); // YYYY-MM-DD
export const dayOf = (iso: string) => NY.format(new Date(iso));
export const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);

export const listRepos = async (cfg: Record<string, any>): Promise<Repo[]> =>
  (await api(`/users/${cfg.username}/repos?type=owner&per_page=100`)).filter((r: Repo) => !(cfg.exclude ?? []).includes(r.name));

// `author=<user>` is a GitHub account match: it drops bots (github-actions) and anyone else's commits.
export async function commitDates(user: string, repo: string, since?: string): Promise<string[]> {
  const out: string[] = [];
  for (let page = 1; ; page++) {
    const r: any[] = await api(`/repos/${user}/${repo}/commits?author=${user}&per_page=100&page=${page}${since ? `&since=${since}` : ""}`);
    out.push(...r.map((c) => c.commit.author.date));
    if (r.length < 100) return out;
  }
}

// Forks are skipped: they're not something made here.
export const newRepos = (repos: Repo[], now: string): Item[] =>
  repos.filter((r) => !r.fork).map((r) => item({
    id: `github:repo:${r.name}`,
    source: "github",
    type: "repo",
    title: r.name,
    text: r.description ?? "",
    url: r.html_url,
    published_at: new Date(r.created_at).toISOString(),
    fetched_at: now,
  }));

// One entry per finished day (from..to inclusive) with commits: counts per repo, no commit messages.
export function digests(active: { repo: Pick<Repo, "name" | "html_url">; dates: string[] }[], user: string, from: string, to: string, now: string): Item[] {
  const days = new Map<string, { last: string; repos: Map<string, { name: string; url: string; count: number }> }>();
  for (const { repo, dates } of active) for (const at of dates) {
    const day = dayOf(at);
    if (day < from || day > to) continue;
    const d = days.get(day) ?? days.set(day, { last: at, repos: new Map() }).get(day)!;
    if (at > d.last) d.last = at;
    const r = d.repos.get(repo.name) ?? d.repos.set(repo.name, { name: repo.name, url: repo.html_url, count: 0 }).get(repo.name)!;
    r.count++;
  }
  return [...days].map(([day, d]) => {
    const repos = [...d.repos.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
    const n = repos.reduce((s, r) => s + r.count, 0);
    return item({
      id: `github:commits:${day}`,
      source: "github",
      type: "commits",
      kind: "activity",
      title: `${n} commit${n > 1 ? "s" : ""} in ${repos.length} repo${repos.length > 1 ? "s" : ""}`,
      text: repos.map((r) => `${r.name} (${r.count})`).join("\n"),
      url: repos.length === 1 ? repos[0].url : `https://github.com/${user}`,
      published_at: new Date(d.last).toISOString(),
      fetched_at: now,
      meta: { repos },
    });
  });
}

// New repos every run. Commit digests only for days that have ended, so an entry is written once, not rewritten all day
// (no bot commits mid-session). cursor = last finished day handled; a first run starts at yesterday (older: backfill.ts).
// The cursor is only persisted when something else made the run commit, which is fine: re-checking is cheap.
const github: Fetcher = async (cfg, prev) => {
  const now = new Date().toISOString();
  const yesterday = addDays(dayOf(now), -1);
  const from = prev.cursor ? addDays(prev.cursor, 1) : yesterday;
  const repos = await listRepos(cfg);
  const items = newRepos(repos, now);
  if (from <= yesterday) {
    const since = `${addDays(from, -1)}T00:00:00Z`; // a day early; digests() filters by New York day
    const active = await Promise.all(repos.filter((r) => r.pushed_at >= since).map(async (repo) => ({ repo, dates: await commitDates(cfg.username, repo.name, since) })));
    items.push(...digests(active, cfg.username, from, yesterday, now));
  }
  return { items, state: { cursor: yesterday } };
};

export const required = ["username"];
export default github;
