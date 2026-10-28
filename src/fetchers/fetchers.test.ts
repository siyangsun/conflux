import { test } from "node:test";
import assert from "node:assert/strict";
import { htmlToText, imagesOf } from "../text.ts";
import * as substack from "./substack.ts";
import * as tumblr from "./tumblr.ts";
import * as soundcloud from "./soundcloud.ts";
import * as youtube from "./youtube.ts";

const NOW = "2026-10-28T00:00:00Z";

test("htmlToText strips tags, keeps paragraphs, decodes entities", () => {
  assert.equal(htmlToText("<p>a &amp; b</p><p>c<br>d &lt;i&gt;</p>"), "a & b\n\nc\nd <i>");
});

test("substack: slug id, teaser only (not the essay body)", () => {
  const xml = `<rss><channel><item><title>Hi</title><link>https://sump.substack.com/p/hello-world</link>
  <guid isPermaLink="false">999</guid><pubDate>Tue, 27 Oct 2026 22:45:00 GMT</pubDate>
  <description>short</description><content:encoded><![CDATA[<p>Full body</p>]]></content:encoded>
  <enclosure url="https://img/x.jpg" type="image/jpeg"/></item></channel></rss>`;
  const [i] = substack.parse(xml, NOW, "sump");
  assert.equal(i.id, "substack:sump:hello-world");
  assert.deepEqual(i.meta, { account: "sump", account_url: "https://sump.substack.com" });
  assert.equal(i.text, "short");
  assert.equal(i.url, "https://sump.substack.com/p/hello-world");
  assert.equal(i.published_at, "2026-10-27T22:45:00.000Z");
  assert.deepEqual(i.images, []);
});

const tumblrXml = `<rss><channel>
<item><title>A real title</title><guid>https://me.tumblr.com/post/111</guid><link>https://me.tumblr.com/post/111</link>
<pubDate>Tue, 27 Oct 2026 20:00:00 GMT</pubDate><description>&lt;p&gt;my post body&lt;/p&gt;&lt;img src="https://i/1.jpg"&gt;</description><category>art</category></item>
<item><title>x</title><guid>https://me.tumblr.com/post/222</guid><link>https://me.tumblr.com/post/222</link>
<pubDate>Tue, 27 Oct 2026 21:00:00 GMT</pubDate><description>&lt;p&gt;&lt;a class="tumblr_blog" href="https://o.tumblr.com"&gt;orig&lt;/a&gt;:&lt;/p&gt;&lt;blockquote&gt;&lt;p&gt;THEIR TEXT&lt;/p&gt;&lt;img src="https://i/2.jpg"&gt;&lt;/blockquote&gt;&lt;p&gt;my comment&lt;/p&gt;</description></item>
</channel></rss>`;

test("tumblr: own post keeps images, title and tags", () => {
  const [own] = tumblr.parse(tumblrXml, NOW);
  assert.equal(own.id, "tumblr:111");
  assert.equal(own.title, "A real title");
  assert.deepEqual(own.images, ["https://i/1.jpg"]);
  assert.deepEqual(own.tags, ["art"]);
});

test("tumblr: reblog stores only my comment, no foreign text or images", () => {
  const [, re] = tumblr.parse(tumblrXml, NOW);
  assert.equal(re.text, "my comment");
  assert.deepEqual(re.images, []);
  assert.deepEqual([re.kind, re.meta], ["reblog", { reblog_from: "orig" }]);
  assert.equal(tumblr.parse(tumblrXml, NOW)[0].kind, "post");
});

test("youtube: embed, thumbnail, alternate link", () => {
  const xml = `<feed xmlns:yt="y" xmlns:media="m"><entry><yt:videoId>abc123</yt:videoId><title>Vid</title>
  <link rel="alternate" href="https://www.youtube.com/watch?v=abc123"/><published>2026-10-27T10:00:00+00:00</published>
  <media:group><media:thumbnail url="https://t/x.jpg"/><media:description>desc</media:description></media:group></entry></feed>`;
  const [v] = youtube.parse(xml, NOW);
  assert.deepEqual([v.id, v.type, v.embed, v.images, v.text], ["youtube:abc123", "video", { provider: "youtube", id: "abc123" }, [], "desc"]);
});

import * as arena from "./arena.ts";
import { sinceCursor } from "./arena.ts";
import * as x from "./x.ts";

const blk = (id: number, over: object = {}) => ({
  id, type: "Image", title: "t", visibility: "public", state: "available", image: { src: "https://img/a.jpg" },
  description: { plain: "d" }, source: { url: "https://src/" },
  connection: { id: id * 10, connected_at: "2026-10-27T10:00:00Z", connected_by: { id: 7 } }, ...over,
});

test("arena: only my public available connections, one item per connection", () => {
  const ch = { title: "Chan", slug: "chan", owner: { slug: "me" } };
  const items = arena.parse([
    blk(1),
    blk(2, { visibility: "private" }),
    blk(3, { connection: { id: 30, connected_at: "2026-10-27T10:00:00Z", connected_by: { id: 99 } } }),
    blk(4, { state: "processing" }),
  ], ch, 7, NOW);
  assert.deepEqual(items.map((i) => i.id), ["arena:10"]);
  assert.equal(items[0].url, "https://www.are.na/block/1");
  assert.deepEqual(items[0].meta.channel, { title: "Chan", url: "https://www.are.na/me/chan" });
  assert.deepEqual(items[0].images, ["https://img/a.jpg"]);
});

test("x: photo urls resolved from includes, url built from handle", () => {
  const [p] = x.parse({
    data: [{ id: "55", text: "hi", created_at: "2026-10-27T10:00:00.000Z", attachments: { media_keys: ["k1", "k2"] } }],
    includes: { media: [{ media_key: "k1", type: "photo", url: "https://p/1.jpg" }, { media_key: "k2", type: "video" }] },
  }, "me", NOW);
  assert.deepEqual([p.id, p.url, p.images], ["x:55", "https://x.com/me/status/55", ["https://p/1.jpg"]]);
});

import { diff, fromSitemap } from "./quartz.ts";
import { shouldBeOpen } from "../issues.ts";

const pg = (slug: string, content: string) => ({ slug, title: slug.toUpperCase(), content, links: [], tags: [] });
const cfg = { site_url: "https://q.example/c" };

test("quartz: first run baselines silently; later diffs report added/updated pages only", () => {
  const idx1 = { a: pg("a", "one"), b: pg("b", "two") };
  const first = diff(idx1, undefined, cfg, NOW);
  assert.equal(first.items.length, 0);
  assert.deepEqual(Object.keys(first.hashes), ["a", "b"]);
  assert.equal(diff(idx1, first.hashes, cfg, NOW).items.length, 0);

  const one = diff({ a: pg("a", "CHANGED"), b: idx1.b }, first.hashes, cfg, NOW).items[0];
  assert.deepEqual([one.title, one.url], ["Updated 1 page", "https://q.example/c/a"]);

  // A new page is its own post; only edits go in the activity digest.
  const both = diff({ a: pg("a", "CHANGED"), b: idx1.b, c: pg("c", "new") }, first.hashes, cfg, NOW).items;
  assert.deepEqual(both.map((i) => [i.id, i.kind, i.type, i.title]), [["quartz:page:c", "post", "page", "C"], [both[1].id, "activity", "site-update", "Updated 1 page"]]);
  assert.equal(both[0].url, "https://q.example/c/c");
  const onlyNew = diff({ ...idx1, c: pg("c", "new") }, first.hashes, cfg, NOW).items;
  assert.deepEqual(onlyNew.map((i) => i.id), ["quartz:page:c"]);
});

test("issues: open only after 24h of failing", () => {
  const now = Date.parse("2026-10-28T12:00:00Z");
  assert.equal(shouldBeOpen({ failing_since: "2026-10-27T11:00:00Z" }, now), true);
  assert.equal(shouldBeOpen({ failing_since: "2026-10-28T00:00:00Z" }, now), false);
  assert.equal(shouldBeOpen({ failing_since: null }, now), false);
});

test("soundcloud: track id, player embed, empty filler items skipped", () => {
  const xml = `<rss><channel><item><guid isPermaLink="false">tag:soundcloud,2010:tracks/123</guid><title>demo</title>
  <pubDate>Sun, 26 Apr 2026 14:50:54 +0000</pubDate><link>https://soundcloud.com/me/demo</link>
  <description>demo by me</description><itunes:image href="https://i/art.jpg"/></item><item></item></channel></rss>`;
  const items = soundcloud.parse(xml, NOW);
  assert.equal(items.length, 1);
  assert.deepEqual([items[0].id, items[0].type, items[0].text, items[0].images], ["soundcloud:123", "audio", "", []]);
  assert.deepEqual(items[0].meta, { account: "me", account_url: "https://soundcloud.com/me" });
  assert.equal(items[0].embed!.id, "https://w.soundcloud.com/player/?url=https%3A%2F%2Fsoundcloud.com%2Fme%2Fdemo");
});

test("soundcloud: next-page cursor from the feed", () => {
  assert.equal(soundcloud.nextBefore('<atom:link href="https://f/sounds.rss?before=2308388903" rel="next" type="application/rss+xml"/>'), "2308388903");
  assert.equal(soundcloud.nextBefore("<rss></rss>"), undefined);
});

test("youtube watch page: title, upload date, escaped description", () => {
  const html = `<meta name="title" content="A &amp; B"><meta itemprop="uploadDate" content="2022-07-28T10:58:20-04:00">..."shortDescription":"line1\\nline \\"2\\""`;
  const v = youtube.parseWatch(html, "abc123abc12", NOW);
  assert.deepEqual([v.id, v.title, v.published_at, v.text], ["youtube:abc123abc12", "A & B", "2022-07-28T14:58:20.000Z", 'line1\nline "2"']);
});

test("quartz backfill: sitemap lastmod grouped by day, titles from the index", () => {
  const sm = `<urlset>
  <url><loc>https://s.io/c/a</loc><lastmod>2024-01-14T06:00:00.000Z</lastmod></url>
  <url><loc>https://s.io/c/b</loc><lastmod>2024-01-14T07:00:00.000Z</lastmod></url>
  <url><loc>https://s.io/</loc><lastmod>2025-02-01T00:00:00.000Z</lastmod></url></urlset>`;
  const items = fromSitemap(sm, { a: { slug: "a", title: "Alpha" }, b: { slug: "b" }, index: { slug: "index", title: "Home" } }, { site_url: "https://s.io/c" }, NOW);
  assert.deepEqual(items.map((i) => [i.id, i.title, i.published_at, i.text]), [
    ["quartz:backfill-2024-01-14", "Updated 2 pages", "2024-01-14T07:00:00.000Z", "Alpha (updated)\nb (updated)"],
    ["quartz:backfill-2025-02-01", "Updated 1 page", "2025-02-01T00:00:00.000Z", "Home (updated)"],
  ]);
  assert.equal(items[1].url, "https://s.io/c/");
  assert.deepEqual(items[0].meta.pages, [{ title: "Alpha", url: "https://s.io/c/a", status: "updated" }, { title: "b", url: "https://s.io/c/b", status: "updated" }]);
});

import { addDays, dayOf, digests, newRepos } from "./github.ts";

test("github: new repos skip forks; digests group by New York day and repo", () => {
  const repos = [
    { name: "mine", html_url: "https://github.com/u/mine", description: "d", created_at: "2026-10-28T00:00:00Z", pushed_at: "", fork: false },
    { name: "theirs", html_url: "https://github.com/u/theirs", description: null, created_at: "2026-09-12T00:00:00Z", pushed_at: "", fork: true },
  ];
  assert.deepEqual(newRepos(repos, NOW).map((i) => [i.id, i.title, i.text]), [["github:repo:mine", "mine", "d"]]);
  // 2026-10-02T03:30Z is still Oct 1 in New York.
  assert.equal(dayOf("2026-10-02T03:30:00Z"), "2026-10-01");
  assert.equal(addDays("2026-10-31", 1), "2026-11-01");
  const a = { name: "a", html_url: "https://github.com/u/a" }, b = { name: "b", html_url: "https://github.com/u/b" };
  const out = digests([
    { repo: a, dates: ["2026-10-02T03:30:00Z", "2026-10-01T15:00:00Z", "2026-10-05T12:00:00Z"] },
    { repo: b, dates: ["2026-10-01T16:00:00Z"] },
  ], "u", "2026-10-01", "2026-10-04", NOW);
  assert.equal(out.length, 1); // Oct 5 is past `to`
  assert.deepEqual([out[0].id, out[0].title, out[0].text, out[0].url], ["github:commits:2026-10-01", "3 commits in 2 repos", "a (2)\nb (1)", "https://github.com/u"]);
});

test("tumblr: an auto-title that repeats the text is dropped, a real title is kept", () => {
  assert.equal(tumblr.realTitle("DJ WORM tour merch", "DJ WORM tour merch"), undefined);
  assert.equal(tumblr.realTitle("a long caption that…", "a long caption that goes on"), undefined);
  assert.equal(tumblr.realTitle("my post", "something else"), "my post");
  assert.equal(tumblr.realTitle("only a title", ""), "only a title");
});

test("imagesOf: largest srcset candidate, else src", () => {
  const sized = '<img src="https://t/s640x960/a.png" srcset="https://t/s75x75_c1/b.png 75w, https://t/s1280x1920/c.png 1280w, https://t/s640x960/a.png 640w">';
  assert.deepEqual(imagesOf(sized + '<img src="https://i/plain.jpg">'), ["https://t/s1280x1920/c.png", "https://i/plain.jpg"]);
});

test("arena: a new channel is a post; private and others' channels are skipped", () => {
  const ch = (id: number, over: object = {}) => ({ id, title: "t" + id, slug: "s" + id, visibility: "closed", created_at: "2026-10-20T00:00:00Z", owner: { id: 7, slug: "me" }, description: { plain: "d" }, ...over });
  const out = arena.channelPosts([ch(1), ch(2, { visibility: "private" }), ch(3, { owner: { id: 8, slug: "x" } })], 7, NOW);
  assert.deepEqual(out.map((i) => [i.id, i.kind, i.type, i.title, i.url]), [["arena:channel:1", "post", "channel", "t1", "https://www.are.na/me/s1"]]);
});

test("arena: cursor is the newest updated_at whatever the list order; only newer, non-private channels are re-read", () => {
  const ch = (id: string, updated_at: string, visibility = "closed") => ({ id, updated_at, visibility });
  const list = [ch("a", "2025-10-04T00:00:00Z"), ch("b", "2026-11-04T00:00:00Z"), ch("c", "2026-01-01T00:00:00Z"), ch("p", "2026-12-01T00:00:00Z", "private")];
  const first = sinceCursor(list);
  assert.equal(first.open.length, 3);
  assert.equal(first.cursor, "2026-12-01T00:00:00Z"); // private channels still move the cursor: cheaper than re-reading
  const again = sinceCursor(list, first.cursor);
  assert.deepEqual([again.open.length, again.cursor], [0, first.cursor]);
  assert.deepEqual(sinceCursor(list, "2026-01-01T00:00:00Z").open.map((c) => c.id), ["b"]);
});
