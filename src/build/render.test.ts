import { test } from "node:test";
import assert from "node:assert/strict";
import { paragraphs } from "./render.ts";

test("paragraphs links bare URLs, keeps trailing punctuation outside, stays escaped", () => {
  assert.equal(paragraphs("see https://a.com/x?a=1&b=2."), '<p>see <a href="https://a.com/x?a=1&#38;b=2" rel="noopener">https://a.com/x?a=1&#38;b=2</a>.</p>');
  assert.equal(paragraphs('x <b> "https://a.com"'), '<p>x &#60;b&#62; &#34;<a href="https://a.com" rel="noopener">https://a.com</a>&#34;</p>');
});

test("x tweets link @mentions and #hashtags; other sources and emails/entities are left alone", () => {
  assert.equal(paragraphs("hi @bob_1 #cool-ish a@b.com #123 &amp;", "x"),
    '<p>hi <a href="https://x.com/bob_1" rel="noopener">@bob_1</a> <a href="https://x.com/hashtag/cool" rel="noopener">#cool</a>-ish a@b.com #123 &#38;amp;</p>');
  assert.equal(paragraphs("hi @bob #tag", "tumblr"), "<p>hi @bob #tag</p>");
});
