import { appendFileSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { config } from "./config.ts";
import { syncIssues } from "./issues.ts";
import { addItems } from "./store.ts";
import type { Fetcher, Item, SourceState } from "./types.ts";

// Every src/fetchers/<name>.ts (not *.test.ts) is a source, keyed by file name and matching its config block.
type FetcherModule = { default: Fetcher; required?: string[] };
const fetchers: Record<string, FetcherModule> = {};
for (const f of readdirSync(new URL("./fetchers/", import.meta.url)).filter((f) => /^\w+\.ts$/.test(f))) {
  fetchers[f.slice(0, -3)] = await import(`./fetchers/${f}`);
}
const STATE = "data/state.json";

const state: Record<string, SourceState> = JSON.parse(readFileSync(STATE, "utf8"));
const now = new Date().toISOString();

for (const n of Object.keys(config.sources)) if (!fetchers[n]) console.error(`::warning::config has source "${n}" but src/fetchers/${n}.ts does not exist`);
// Sources marked "hourly" only run in the first 20 minutes of each hour on scheduled runs (the :07 slot of the 15-minute cron).
// Pushes and manual runs always run everything. Stateless on purpose: remembering "last checked" would mean a commit per check.
const off = process.env.GITHUB_EVENT_NAME === "schedule" && new Date().getUTCMinutes() >= 20;
const jobs = Object.entries<Record<string, any>>(config.sources).filter(([n, c]) => c.enabled && fetchers[n] && !(off && c.hourly));
// One failing source never stops the others: allSettled, log, keep its old cursor.
// A missing config key fails the source like any fetch error, so it reaches the failure-issue flow.
const t0 = performance.now(), took: Record<string, number> = {}; // per-source wall time (sources run in parallel)
const results = await Promise.allSettled(jobs.map(async ([n, c]) => {
  const start = performance.now();
  try { return await fetchOne(n, c); } finally { took[n] = performance.now() - start; }
}));
async function fetchOne(n: string, c: Record<string, any>) {
  const missing = (fetchers[n].required ?? []).filter((k) => (Array.isArray(c[k]) ? !c[k].length : !c[k]));
  if (missing.length) throw new Error(`config.sources.${n} is missing: ${missing.join(", ")}`);
  return fetchers[n].default(c, state[n] ?? {});
}
const fetched = performance.now() - t0;

const incoming: Item[] = [];
const remove: string[] = [];
let persist = false; // state that must be saved even when no items were added
jobs.forEach(([name], i) => {
  const r = results[i];
  const prev = state[name] ?? {};
  if (r.status === "fulfilled") {
    incoming.push(...r.value.items);
    remove.push(...(r.value.remove ?? []));
    persist ||= !!r.value.persist || !!prev.failing_since; // first-run baselines, recoveries
    state[name] = { ...prev, ...r.value.state, last_error: null, failing_since: null };
  } else {
    const msg = String(r.reason?.message ?? r.reason);
    console.error(`::warning::${name} failed: ${msg}`);
    persist ||= !prev.failing_since;
    state[name] = { ...prev, last_error: msg, failing_since: prev.failing_since ?? now };
  }
});

const t1 = performance.now();
const { added, changed } = addItems(incoming, undefined, remove);
const count = added.length + changed; // anything that changes the site
const dirty = count > 0 || persist;
if (dirty) writeFileSync(STATE, JSON.stringify(state, null, 2) + "\n");
try { await syncIssues(state); } catch (e) { console.error(`::warning::${(e as Error).message}`); }

const secs = (ms: number) => `${(ms / 1000).toFixed(1)}s`;
console.log(`timing: fetch ${secs(fetched)} (${Object.entries(took).sort((a, b) => b[1] - a[1]).map(([n, ms]) => `${n} ${secs(ms)}`).join(", ")}), store ${secs(performance.now() - t1)}`);
const sources = [...new Set(added.map((i) => i.source))].join(", ");
const summary = count
  ? `feed: ${[added.length && `+${added.length} items (${sources})`, changed && `${changed} edited/removed`].filter(Boolean).join(", ")}`
  : "feed: state";
console.log(dirty ? summary : "no new items");
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `count=${count}\ndirty=${dirty}\nsummary=${summary}\n`);
