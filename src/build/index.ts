import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { loadAll } from "../store.ts";
import type { Item } from "../types.ts";
import { atom, feedLinks, jsonFeed } from "./feeds.ts";
import { abs, BASE, DESC, entryUrl, esc, hasPage, page, permalink, renderItem, SITE, slug, title } from "./render.ts";

const OUT = "_site";
const PAGE = 50;

const write = (path: string, html: string) => {
  mkdirSync(`${OUT}/${path}`, { recursive: true });
  writeFileSync(`${OUT}/${path}/index.html`, html);
};

// Page 1 lives at `base`, later pages at `base`/page/N/.
function paged(base: string, heading: string, list: Item[], head = "", intro = "") {
  const pages = Math.max(1, Math.ceil(list.length / PAGE));
  for (let n = 1; n <= pages; n++) {
    const at = (k: number) => `${BASE}/${base}${k === 1 ? "" : `page/${k}/`}`;
    const nav = `<p class="pager">${n > 1 ? `<a href="${at(n - 1)}">← newer</a> ` : ""}${n < pages ? `<a href="${at(n + 1)}">older →</a>` : ""}</p>`;
    const items = list.slice((n - 1) * PAGE, n * PAGE).map(renderItem).join("\n") || "<p>Nothing yet.</p>";
    write(n === 1 ? base : `${base}page/${n}/`, page(n === 1 ? heading : `${heading} · page ${n}`, `${heading === SITE ? "" : `<h2 class="list">${esc(heading)}</h2>`}${intro}${items}${nav}`, head));
  }
}

const items = loadAll();
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
cpSync("site", OUT, { recursive: true }); // style.css, site.js

// Three views: posts (the home page), reblogs, and all (every kind, including activity). Each has pages, an archive and feeds.
const VIEWS = [
  { name: "posts", path: "", list: items.filter((i) => i.kind === "post") },
  { name: "reblogs", path: "reblogs/", list: items.filter((i) => i.kind === "reblog") },
  { name: "all activity", path: "all/", list: items },
];
const monthsOf = (list: Item[]) => Object.entries(Object.groupBy(list, (i) => i.published_at.slice(0, 7))) as [string, Item[]][];
const months = VIEWS.map((v) => new Set(monthsOf(v.list).map(([m]) => m)));

for (const v of VIEWS) {
  paged(v.path, v.path ? v.name : SITE, v.list, v.path ? feedLinks(`/${v.path}`, `${v.name} · ${SITE}`) : `<meta name="description" content="${esc(DESC)}">`);

  // Archive: a month index plus paged month pages for this view. The "show" line switches views, staying on the same month when it exists there.
  const dir = `archive/${v.path}`.replace(/\/$/, "");
  const show = (month?: string) => `<p class="meta">show: ${VIEWS.map((w, k) => {
    if (w === v) return `<b>${w.name}</b>`;
    const to = month && months[k].has(month) ? `${month.replace("-", "/")}/` : "";
    return `<a href="${BASE}/archive/${w.path}${to}">${w.name}</a>`;
  }).join(" · ")}</p>`;
  const list = monthsOf(v.list);
  write(dir, page(`Archive · ${SITE}`, `<h2 class="list">Archive</h2>${show()}<ul>${list.map(([m, l]) => `<li><a href="${BASE}/${dir}/${m.replace("-", "/")}/">${m}</a> <span class="meta">${l.length}</span></li>`).join("")}</ul>`));
  // Month pages link to the neighbouring months that exist in this view (list is newest first).
  const month = (m?: string, arrow = "") => m ? `<a href="${BASE}/${dir}/${m.replace("-", "/")}/">${arrow === "←" ? `← ${m}` : `${m} →`}</a>` : "";
  list.forEach(([m, l], k) => paged(`${dir}/${m.replace("-", "/")}/`, m, l, "", `${show(m)}<p class="meta">${[month(list[k - 1]?.[0], "←"), month(list[k + 1]?.[0], "→")].filter(Boolean).join(" · ")}</p>`));
}

// Filters by source (each with its own feeds), type and tag; /browse/ lists them all.
const writeFeeds = (dir: string, list: Item[], name: string) => {
  mkdirSync(`${OUT}${dir}`, { recursive: true });
  writeFileSync(`${OUT}${dir}feed.xml`, atom(list.slice(0, PAGE), dir, name));
  writeFileSync(`${OUT}${dir}feed.json`, jsonFeed(list.slice(0, PAGE), dir, name));
};
const groups = (key: (i: Item) => string[]) => {
  const m = new Map<string, { label: string; list: Item[] }>();
  for (const i of items) for (const k of key(i)) if (slug(k)) (m.get(slug(k)) ?? m.set(slug(k), { label: k, list: [] }).get(slug(k))!).list.push(i);
  return [...m].sort((a, b) => b[1].list.length - a[1].list.length);
};
const bySource = groups((i) => [i.source]);
const byType = groups((i) => [i.type]);
const byTag = groups((i) => [...new Set(i.tags.filter(slug))]);
for (const [s, { label, list }] of bySource) {
  const dir = `/source/${s}/`, name = `${label} · ${SITE}`;
  paged(dir.slice(1), label, list, feedLinks(dir, name));
  writeFeeds(dir, list, name);
}
for (const [s, { label, list }] of byType) paged(`type/${s}/`, label, list);
for (const [s, { label, list }] of byTag) paged(`tag/${s}/`, `#${label}`, list);
const links = (heading: string, dir: string, g: typeof bySource, prefix = "") =>
  g.length ? `<h2 class="list">${heading}</h2><ul>${g.map(([s, { label, list }]) => `<li><a href="${BASE}/${dir}/${s}/">${prefix}${esc(label)}</a> <span class="meta">${list.length}</span></li>`).join("")}</ul>` : "";
write("browse", page(`Browse · ${SITE}`, links("Sources", "source", bySource) + links("Types", "type", byType) + links("Tags", "tag", byTag, "#")));

// Permalink pages (posts only), with OpenGraph / Twitter card tags.
for (const i of items.filter(hasPage)) {
  const t = title(i);
  const og = `<meta property="og:title" content="${esc(t)}"><meta property="og:description" content="${esc(i.text.slice(0, 200))}">
<meta property="og:type" content="article"><meta property="og:url" content="${esc(abs(permalink(i)))}">
${i.images[0] ? `<meta property="og:image" content="${esc(i.images[0])}">` : ""}<meta name="twitter:card" content="${i.images[0] ? "summary_large_image" : "summary"}">`;
  write(`p/${slug(i.id)}`, page(`${t} · ${SITE}`, renderItem(i), og));
}

// Search: one JSON row per item [label, link, source, date, lowercase text], filtered in the browser (site/site.js). ponytail: fine to a few thousand items; shard or add Pagefind past ~10k.
writeFileSync(`${OUT}/search.json`, JSON.stringify(items.map((i) => [title(i), entryUrl(i), i.source, i.published_at.slice(0, 10), `${i.title ?? ""} ${i.text} ${i.tags.join(" ")}`.toLowerCase()])));
write("search", page(`Search · ${SITE}`, `<h2 class="list">Search</h2><input id="q" type="search" placeholder="search ${items.length} items" autofocus data-src="${BASE}/search.json"><ul id="results"></ul>`));

for (const v of VIEWS) writeFeeds(`/${v.path}`, v.list, v.path ? `${v.name} · ${SITE}` : SITE);
console.log(`built ${items.length} items`);
