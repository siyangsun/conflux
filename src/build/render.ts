import { config } from "../config.ts";
import type { Item, ItemType } from "../types.ts";
import { feedLinks } from "./feeds.ts";

export const { title: SITE, description: DESC, url: ORIGIN } = config.site;
export const BASE: string = process.env.BASE_PATH ?? config.site.base_path; // BASE_PATH="" for local preview
export const REPO = process.env.GITHUB_REPOSITORY ?? config.site.repo;
export const BUILT = new Date().toISOString();

export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
export const slug = (id: string) => id.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
export const permalink = (i: Item) => `${BASE}/p/${slug(i.id)}/`;
export const abs = (path: string) => ORIGIN + path;
// Only posts get a page of their own (/p/...). Reblogs and activity link out to their original; their permalink() is still their stable feed id.
export const hasPage = (i: Item) => i.kind === "post";
export const title = (i: Item) => i.title || i.text.slice(0, 80) || i.id;
// Only http(s) links are rendered as hrefs (no javascript: URLs from feed data).
const safe = (u: string) => (/^https?:\/\//i.test(u) ? u : "#");
// Where an item's date, and its feed entry, should point.
export const entryUrl = (i: Item) => (hasPage(i) ? abs(permalink(i)) : safe(i.url) !== "#" ? i.url : abs(BASE + "/"));
const when = (iso: string) =>
  new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
const paragraphs = (t: string) => t.split(/\n{2,}/).filter(Boolean).map((p) => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`).join("");

// YouTube: click-to-load. The poster is derived from the video id (nothing stored); the iframe replaces it on click (see site/site.js).
// SoundCloud: the compact player, lazy-loaded. Both ids are checked so stored data can't inject an arbitrary iframe.
const YT = /^[\w-]{11}$/, SC = /^https:\/\/w\.soundcloud\.com\/player\/\?/;
const soundcloudSrc = (id: string) => `${id}${id.includes("visual=") ? "" : "&visual=false"}&hide_related=true&show_comments=false`;
function embed(e: NonNullable<Item["embed"]>): string {
  if (e.provider === "youtube" && YT.test(e.id))
    return `<button class="embed" data-src="https://www.youtube-nocookie.com/embed/${e.id}?autoplay=1" data-h="315" aria-label="Play"><img src="https://i.ytimg.com/vi/${e.id}/hqdefault.jpg" loading="lazy" alt=""><span>▶</span></button>`;
  if (e.provider === "soundcloud" && SC.test(e.id)) {
    const src = soundcloudSrc(e.id);
    return `<iframe class="embed" src="${esc(src)}" height="${src.includes("visual=true") ? 300 : 166}" loading="lazy" allow="autoplay; encrypted-media" title="SoundCloud player"></iframe>`;
  }
  return "";
}
const img = (u: string) => `<img src="${esc(u)}" loading="lazy" alt="" onerror="this.remove()">`;

const siteUpdate = (i: Item) => {
  const pages = (i.meta.pages as { title: string; url: string; status: string }[] | undefined) ?? [];
  return `<ul>${pages.map((p) => `<li><a href="${esc(safe(p.url))}" rel="noopener">${esc(p.title)}</a> <span class="meta">${p.status === "added" ? "new" : "updated"}</span></li>`).join("")}</ul>`;
};
const commits = (i: Item) => {
  const repos = (i.meta.repos as { name: string; url: string; count: number }[] | undefined) ?? [];
  return `<ul>${repos.map((r) => `<li><a href="${esc(safe(r.url))}" rel="noopener">${esc(r.name)}</a> <span class="meta">${r.count}</span></li>`).join("")}</ul>`;
};
const plain = (i: Item) => paragraphs(i.text);
// Record<ItemType, ...>: adding a type to ItemType without a renderer is a type error.
const BODY: Record<ItemType, (i: Item) => string> = { post: plain, video: plain, audio: plain, block: plain, "site-update": siteUpdate, repo: plain, commits, page: plain, channel: plain };

const dateLink = (i: Item) => {
  const t = `<time datetime="${i.published_at}">${when(i.published_at)}</time>`;
  return hasPage(i) ? `<a href="${permalink(i)}">${t}</a>` : safe(i.url) !== "#" ? `<a href="${esc(i.url)}" rel="noopener">${t}</a>` : t;
};

// What happened, as a lead-in for the meta line; `s` is the linked source name.
const lead = (i: Item, s: string) =>
  i.type === "repo" ? `created a new repo on ${s}`
  : i.type === "channel" ? `created a new channel on ${s}`
  : i.type === "page" ? `added a page to ${s}`
  : i.type === "commits" ? `committed on ${s}`
  : i.type === "site-update" ? `updated ${s}`
  : i.type === "video" ? `posted a video to ${s}`
  : i.kind === "reblog" ? (i.source === "arena" ? `saved to ${s}` : `reblogged on ${s}`)
  : i.source === "manual" ? "posted"
  : `posted to ${s}`;

// "via @name": the profile or publication posted to, when the fetcher recorded one (meta.account, meta.account_url).
const via = (i: Item) => {
  const { account, account_url } = i.meta as { account?: string; account_url?: string };
  return account ? ` via ${account_url ? `<a href="${esc(safe(account_url))}" rel="noopener">@${esc(account)}</a>` : `@${esc(account)}`}` : "";
};

export function renderItem(i: Item): string {
  const media = (i.embed && embed(i.embed)) || i.images.map(img).join("");
  const linked = i.tags.filter(slug); // symbol-only tags slug to "" and get no page
  const tags = linked.length ? `<p class="tags">${linked.map((t) => `<a href="${BASE}/tag/${slug(t)}/">#${esc(t)}</a>`).join(" ")}</p>` : "";
  const ch = i.meta.channel as { title: string; url: string } | undefined;
  // Link previews are capped by the stylesheet: manual posts (OpenGraph unfurl) and Are.na Link/Embed/Attachment blocks. Are.na Image blocks stay full size.
  const preview = i.id.startsWith("manual:") || (i.source === "arena" && i.meta.block_type !== "Image");
  return `<article${preview ? ' class="preview"' : ""}>
<div class="meta">${lead(i, `<a href="${BASE}/source/${slug(i.source)}/">${esc(i.source)}</a>`)}${via(i)} · ${dateLink(i)}${i.url && !i.title ? ` · <a href="${esc(safe(i.url))}" rel="noopener">original</a>` : ""}${ch ? ` · in <a href="${esc(safe(ch.url))}" rel="noopener">${esc(ch.title)}</a>` : ""}</div>
${i.title ? `<h2>${i.url ? `<a href="${esc(safe(i.url))}" rel="noopener">${esc(i.title)}</a>` : esc(i.title)}</h2>` : ""}${BODY[i.type](i)}${media}${tags}
</article>`;
}

export function page(pageTitle: string, body: string, head = ""): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(pageTitle)}</title><link rel="icon" href="data:,"><link rel="stylesheet" href="${BASE}/style.css">
${feedLinks("/")}${head}</head>
<body><header><h1><a href="${BASE}/">${esc(SITE)}</a></h1>
<nav><a href="${BASE}/">posts</a> · <a href="${BASE}/reblogs/">reblogs</a> · <a href="${BASE}/all/">all activity</a> · <a href="${BASE}/search/">search</a> · <a href="${BASE}/archive/">archive</a> · <a href="${BASE}/browse/">browse</a> · <a href="${BASE}/feed.xml">feed</a> · <span id="checked" data-built="${BUILT}" data-repo="${esc(REPO)}"></span></nav></header>
<main>${body}</main><script src="${BASE}/site.js" defer></script></body></html>`;
}
