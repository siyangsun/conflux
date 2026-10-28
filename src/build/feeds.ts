import type { Item } from "../types.ts";
import { abs, BASE, BUILT, DESC, entryUrl, esc, hasPage, permalink, SITE, title } from "./render.ts";

// A feed lives at `<dir>feed.xml` (Atom) and `<dir>feed.json` (JSON Feed 1.1): dir "/" is the aggregate, "/source/x/" one source.
export const feedLinks = (dir: string, name = SITE) =>
  `<link rel="alternate" type="application/atom+xml" title="${esc(name)}" href="${BASE}${dir}feed.xml"><link rel="alternate" type="application/feed+json" title="${esc(name)}" href="${BASE}${dir}feed.json">`;

export const atom = (latest: Item[], dir = "/", name = SITE) => `<?xml version="1.0" encoding="utf-8"?>
<?xml-stylesheet type="text/xsl" href="${BASE}/feed.xsl"?>
<feed xmlns="http://www.w3.org/2005/Atom"><title>${esc(name)}</title><subtitle>${esc(DESC)}</subtitle>
<id>${esc(abs(BASE + dir))}</id><link rel="self" href="${esc(abs(BASE + dir + "feed.xml"))}"/><link href="${esc(abs(BASE + dir))}"/>
<updated>${latest[0]?.published_at ?? BUILT}</updated>
${latest.map((i) => `<entry><id>${esc(abs(permalink(i)))}</id><title>${esc(title(i))}</title><link href="${esc(entryUrl(i))}"/>
<published>${i.published_at}</published><updated>${i.published_at}</updated><content type="text">${esc(i.text)}</content></entry>`).join("\n")}
</feed>
`;

export const jsonFeed = (latest: Item[], dir = "/", name = SITE) => JSON.stringify({
  version: "https://jsonfeed.org/version/1.1",
  title: name,
  description: DESC,
  home_page_url: abs(BASE + dir),
  feed_url: abs(BASE + dir + "feed.json"),
  items: latest.map((i) => ({
    id: abs(permalink(i)),
    url: entryUrl(i),
    external_url: hasPage(i) && /^https?:\/\//i.test(i.url) ? i.url : undefined,
    title: i.title,
    content_text: i.text,
    date_published: i.published_at,
    tags: i.tags.length ? i.tags : undefined,
    image: i.images[0],
  })),
}, null, 2) + "\n";
