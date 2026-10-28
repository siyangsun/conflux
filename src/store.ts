import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import type { Item } from "./types.ts";

const DIR = "data/items";
const byNewest = (a: Item, b: Item) => b.published_at.localeCompare(a.published_at);

// ponytail: loads every shard; add an id index if this gets slow (~50k items)
export function loadAll(dir = DIR): Item[] {
  try {
    return readdirSync(dir)
      .filter((f) => /^\d{4}-\d{2}\.json$/.test(f))
      .flatMap((f) => JSON.parse(readFileSync(`${dir}/${f}`, "utf8")) as Item[])
      .sort(byNewest);
  } catch {
    return [];
  }
}

const month = (i: Item) => i.published_at.slice(0, 7);

// Applies a batch: appends unseen ids, replaces items whose `rev` changed, drops `remove` ids.
// Rewrites only the touched month files.
export function addItems(incoming: Item[], dir = DIR, remove: string[] = []) {
  const stored = new Map(loadAll(dir).map((i) => [i.id, i]));
  const touched = new Set<string>();
  const added: Item[] = [];
  let changed = 0;
  for (const i of incoming) {
    if (i.visibility !== "public") continue;
    const old = stored.get(i.id);
    if (old && !(i.rev && i.rev !== old.rev)) continue;
    if (old) { touched.add(month(old)); changed++; } else added.push(i);
    touched.add(month(i));
    stored.set(i.id, i);
  }
  for (const id of remove) {
    const old = stored.get(id);
    if (!old) continue;
    touched.add(month(old));
    stored.delete(id);
    changed++;
  }
  mkdirSync(dir, { recursive: true });
  for (const m of touched) {
    const list = [...stored.values()].filter((i) => month(i) === m).sort(byNewest);
    writeFileSync(`${dir}/${m}.json`, JSON.stringify(list, null, 2) + "\n");
  }
  return { added, changed };
}
