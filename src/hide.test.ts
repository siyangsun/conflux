import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { match } from "./hide.ts";
import { addItems, loadAll, update } from "./store.ts";
import type { Item } from "./types.ts";

const mk = (id: string, url = "https://o/" + id): Item => ({
  id, source: "t", type: "post", text: "x", url, published_at: "2026-10-01T00:00:00Z",
  fetched_at: "2026-10-01T00:00:00Z", images: [], tags: [], visibility: "public", meta: {},
});

test("match: deployed link, localhost link, id, original link, and a /p/ original link", () => {
  const items = [mk("x:123"), mk("substack:s:hi", "https://s.substack.com/p/hi")];
  const ids = (a: string) => match(a, items).map((i) => i.id);
  assert.deepEqual(ids("https://siyangsun.github.io/conflux/p/x-123/"), ["x:123"]);
  assert.deepEqual(ids("http://localhost:3000/p/x-123/?a=1#b"), ["x:123"]);
  assert.deepEqual(ids("x:123"), ["x:123"]);
  assert.deepEqual(ids("https://s.substack.com/p/hi"), ["substack:s:hi"]);
  assert.deepEqual(ids("https://siyangsun.github.io/conflux/p/nope/"), []);
});

test("hidden items stay stored, so a re-sync does not add them back", () => {
  const dir = mkdtempSync(`${tmpdir()}/dump-`);
  addItems([mk("t:1")], dir);
  assert.equal(update(new Set(["t:1", "t:nope"]), { visibility: "hidden" }, dir), 1);
  assert.equal(loadAll(dir)[0].visibility, "hidden");
  assert.equal(addItems([mk("t:1")], dir).added.length, 0);
});
