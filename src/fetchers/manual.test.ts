import { test } from "node:test";
import assert from "node:assert/strict";
import { parsePost, sourceFromUrl, toItem } from "./manual.ts";
import { ogParse, scParse } from "../unfurl.ts";

const NOW = "2026-10-28T12:00:00Z";

test("parsePost: frontmatter + body, quotes stripped, no frontmatter = all body", () => {
  const p = parsePost('---\nurl: "https://whosampled.com/x"\nsource: ws\n---\nnice sample\n');
  assert.deepEqual([p.meta.url, p.meta.source, p.body], ["https://whosampled.com/x", "ws", "nice sample"]);
  assert.equal(parsePost("just text").body, "just text");
});

test("sourceFromUrl: domain label", () => {
  assert.equal(sourceFromUrl("https://www.soundcloud.com/a/b"), "soundcloud");
  assert.equal(sourceFromUrl("https://whosampled.com/x"), "whosampled");
});

test("ogParse: any attribute order, entities, relative image", () => {
  const u = ogParse(`<title>T</title><meta content="Hi &amp; bye" property="og:title"><meta property='og:description' content='d'><meta property="og:image" content="/i.jpg">`, "https://a.com/x");
  assert.deepEqual(u, { title: "Hi & bye", description: "d", image: "https://a.com/i.jpg" });
});

test("scParse: embed src from iframe", () => {
  const u = scParse({ title: "Song", thumbnail_url: "https://t/x.jpg", html: '<iframe src="https://w.soundcloud.com/player/?url=abc"></iframe>' });
  assert.deepEqual(u.embed, { provider: "soundcloud", id: "https://w.soundcloud.com/player/?url=abc" });
});

test("toItem: body wins over description; bare link when unfurl is empty; explicit published_at", () => {
  const it = toItem("a", "---\nurl: https://soundcloud.com/x\npublished_at: 2026-10-01T00:00:00Z\n---\nmine", { description: "theirs" }, NOW);
  assert.deepEqual([it.id, it.source, it.text, it.published_at], ["manual:a", "soundcloud", "mine", "2026-10-01T00:00:00.000Z"]);
  const bare = toItem("b", "---\nurl: https://x.com/y\n---\n", {}, NOW);
  assert.deepEqual([bare.text, bare.url, bare.images], ["", "https://x.com/y", []]);
});

test("toItem: frontmatter title overrides the unfurled one", () => {
  assert.equal(toItem("c", "---\ntitle: Mine\nurl: https://x.com/y\n---\n", { title: "Theirs" }, NOW).title, "Mine");
});

test("toItem: an edit keeps first-seen dates, new rev; frontmatter date still wins", () => {
  const first = toItem("d", "---\nurl: https://x.com/y\n---\nv1", {}, NOW);
  const later = "2026-11-01T00:00:00Z";
  const edit = toItem("d", "---\nurl: https://x.com/y\n---\nv2", {}, later, first);
  assert.deepEqual([edit.published_at, edit.fetched_at, edit.text], [first.published_at, NOW, "v2"]);
  assert.notEqual(edit.rev, first.rev);
  assert.equal(toItem("d", "---\npublished_at: 2026-01-01T00:00:00Z\n---\nv3", {}, later, first).published_at, "2026-01-01T00:00:00.000Z");
});
