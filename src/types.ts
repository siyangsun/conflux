// post: made by me. reblog: saved or reblogged from someone else. activity: machine-made digests (commits, site updates).
// Posts and reblogs have their own views; the "all" view shows every kind.
export type Kind = "post" | "reblog" | "activity";
export type ItemType = "post" | "video" | "audio" | "block" | "site-update" | "repo" | "commits" | "page" | "channel";

export type Item = {
  id: string; // <source>:<native id>, dedupe key and permalink slug
  source: string;
  type: ItemType; // add a renderer in src/build/render.ts when extending
  title?: string;
  text: string;
  url: string;
  published_at: string; // UTC ISO 8601
  fetched_at: string;
  images: string[]; // hotlinked only, never downloaded
  embed?: { provider: string; id: string };
  kind: Kind;
  rev?: string; // content fingerprint; an incoming item with the same id and a different rev replaces the stored one
  tags: string[];
  visibility: "public"; // reserved for future privacy
  meta: Record<string, unknown>;
};

export type SourceState = {
  etag?: string;
  last_modified?: string;
  cursor?: string; // source-specific high-water mark (Are.na: channel updated_at, X: since_id)
  hashes?: Record<string, string>; // Quartz: page slug -> content fingerprint
  last_error?: string | null;
  failing_since?: string | null;
};

// A fetcher module default-exports a Fetcher and may export `required`: config keys that must be non-empty.
// Returns new items plus state to merge (cache headers, cursors). Must be idempotent.
export type Fetcher = (
  cfg: Record<string, any>,
  prev: SourceState,
) => Promise<{ items: Item[]; state: Partial<SourceState>; persist?: boolean; remove?: string[] }>;
