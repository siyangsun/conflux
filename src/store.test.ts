import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { addItems, loadAll } from "./store.ts";
import type { Item } from "./types.ts";

const mk = (id: string, published_at: string): Item => ({
  id, source: "t", type: "post", text: "x", url: "https://x", published_at,
  fetched_at: published_at, images: [], tags: [], visibility: "public", meta: {},
});

test("dedupes across runs and shards by month, newest first", () => {
  const dir = mkdtempSync(`${tmpdir()}/dump-`);
  const batch = [mk("t:1", "2026-09-30T00:00:00Z"), mk("t:2", "2026-10-01T00:00:00Z"), mk("t:3", "2026-10-02T00:00:00Z")];
  assert.equal(addItems(batch, dir).added.length, 3);
  assert.equal(addItems(batch, dir).added.length, 0);
  assert.deepEqual(loadAll(dir).map((i) => i.id), ["t:3", "t:2", "t:1"]);
});

test("replaces an item only when rev changes, moves it between shards, and removes ids", () => {
  const dir = mkdtempSync(`${tmpdir()}/dump-`);
  addItems([{ ...mk("t:1", "2026-09-30T00:00:00Z"), rev: "a" }], dir);
  assert.deepEqual(addItems([{ ...mk("t:1", "2026-09-30T00:00:00Z"), rev: "a" }], dir), { added: [], changed: 0 });
  const r = addItems([{ ...mk("t:1", "2026-10-02T00:00:00Z"), text: "edited", rev: "b" }], dir);
  assert.deepEqual([r.added.length, r.changed], [0, 1]);
  assert.deepEqual(loadAll(dir).map((i) => [i.text, i.published_at.slice(0, 7)]), [["edited", "2026-10"]]);
  assert.equal(addItems([], dir, ["t:1", "t:nope"]).changed, 1);
  assert.deepEqual(loadAll(dir), []);
});
