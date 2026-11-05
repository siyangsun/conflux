// Hide items from the site without deleting them, so syncs don't add them back:
//   npm run hide -- <link> [<link>...]          (add --undo to show them again)
// A link is an item page on the deployed site or localhost (matched by its /p/<slug>/ part), an item's original link, or an item id.
import { loadAll, update } from "./store.ts";
import { slug } from "./build/render.ts";
import type { Item } from "./types.ts";

export function match(arg: string, items: Item[]): Item[] {
  const s = arg.match(/\/p\/([^/?#]+)/)?.[1];
  const bySlug = s ? items.filter((i) => slug(i.id) === s) : [];
  return bySlug.length ? bySlug : items.filter((i) => i.id === arg || i.url === arg); // e.g. a substack /p/ link is an original link, not a site page
}

if (process.argv[1]?.endsWith("hide.ts")) {
  const undo = process.argv.includes("--undo");
  const all = loadAll();
  for (const arg of process.argv.slice(2).filter((a) => a !== "--undo")) {
    const hit = match(arg, all);
    if (!hit.length) { console.error(`no match: ${arg}`); process.exitCode = 1; continue; }
    update(new Set(hit.map((i) => i.id)), { visibility: undo ? "public" : "hidden" });
    for (const i of hit) console.log(`${undo ? "shown" : "hidden"}: ${i.id}  ${(i.title || i.text).slice(0, 60).replace(/\n/g, " ")}`);
  }
}
