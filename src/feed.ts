import { XMLParser } from "fast-xml-parser";
import type { Fetcher, Item, SourceState } from "./types.ts";

export const UA = `conflux-feed/1.0 (personal feed aggregator; +https://github.com/${process.env.GITHUB_REPOSITORY ?? "siyang/conflux"})`;
const parser = new XMLParser({ ignoreAttributes: false, parseTagValue: false, parseAttributeValue: false });

export const parseXml = (xml: string): any => parser.parse(xml);
export const arr = <T>(x: T | T[] | undefined | null): T[] => (x == null ? [] : Array.isArray(x) ? x : [x]);
// Element text, whether the parser returned a string or an {#text, @_attr} object.
export const txt = (x: any): string => (x == null ? "" : typeof x === "object" ? String(x["#text"] ?? "") : String(x));
// Fills the fields most items leave empty; pass only what differs.
export const item = (i: Omit<Item, "kind" | "images" | "tags" | "visibility" | "meta"> & Partial<Pick<Item, "kind" | "images" | "tags" | "meta">>): Item =>
  ({ kind: "post", images: [], tags: [], visibility: "public", meta: {}, ...i });
// Content policy, in one place: long-form writing (Substack, Medium) is a link plus teaser, never the essay or its images;
// a reblog keeps only my own comment. Tumblr and Are.na apply the reblog rule themselves (Are.na saves keep a hotlinked image on purpose).
export const teaser = (text: string) => text.slice(0, 300);
// Tumblr and RSS fill <title> with the start of the post text when no title was set (truncated with an ellipsis if long): keep only real titles.
export const realTitle = (title: string, text: string) =>
  title && !text.startsWith(title.replace(/(…|\.\.\.)$/, "")) ? title : undefined;
export const iso = (d: string) => new Date(d).toISOString();

// Conditional GET using stored ETag / Last-Modified; a 304 means nothing new.
export async function get(url: string, prev: SourceState) {
  const headers: Record<string, string> = { "user-agent": UA };
  if (prev.etag) headers["if-none-match"] = prev.etag;
  if (prev.last_modified) headers["if-modified-since"] = prev.last_modified;
  let res!: Response;
  for (let n = 1; n <= 3; n++) { // retry blips; 304 and 2xx are final
    res = await fetch(url, { headers, signal: AbortSignal.timeout(20_000) });
    if (res.ok || res.status === 304 || n === 3) break;
    await new Promise((r) => setTimeout(r, n * 2000));
  }
  if (res.status === 304) return null;
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return {
    text: await res.text(),
    cache: { etag: res.headers.get("etag") ?? undefined, last_modified: res.headers.get("last-modified") ?? undefined },
  };
}

export const feedFetcher =
  (url: (cfg: Record<string, any>) => string, parse: (xml: string, now: string) => Item[]): Fetcher =>
  async (cfg, prev) => {
    const r = await get(url(cfg), prev);
    return r ? { items: parse(r.text, new Date().toISOString()), state: r.cache } : { items: [], state: {} };
  };

// Several feeds, one source: conditional GET per URL. Returns [url, xml] for the feeds that changed, plus the updated per-feed cache.
export async function getEach(urls: string[], prev: SourceState) {
  const feeds = { ...prev.feeds };
  const fresh = (await Promise.all(urls.map(async (u) => {
    const r = await get(u, feeds[u] ?? {});
    if (r) feeds[u] = r.cache;
    return r && ([u, r.text] as const);
  }))).filter((x) => x !== null);
  return { fresh, state: { feeds } };
}
