import { UA } from "./feed.ts";
import { decode } from "./text.ts";

export type Unfurl = { title?: string; description?: string; image?: string; embed?: { provider: string; id: string } };

// Reads <meta property|name="og:*" content="..."> in any attribute order, falls back to <title>.
export function ogParse(html: string, base: string): Unfurl {
  const og: Record<string, string> = {};
  for (const [tag] of html.matchAll(/<meta\b[^>]*>/gi)) {
    const key = tag.match(/(?:property|name)\s*=\s*["']([^"']+)["']/i)?.[1]?.toLowerCase();
    const val = tag.match(/content\s*=\s*"([^"]*)"|content\s*=\s*'([^']*)'/i);
    if (key && val) og[key] ??= decode(val[1] ?? val[2]);
  }
  const image = og["og:image"] ?? og["twitter:image"];
  return {
    title: og["og:title"] ?? (decode(html.match(/<title[^>]*>([^<]*)/i)?.[1]?.trim() ?? "") || undefined),
    description: og["og:description"] ?? og["description"] ?? undefined,
    image: image ? new URL(image, base).href : undefined,
  };
}

export function scParse(oembed: any): Unfurl {
  return {
    title: oembed.title,
    image: oembed.thumbnail_url,
    embed: { provider: "soundcloud", id: String(oembed.html).match(/src="([^"]+)"/)?.[1] ?? "" },
  };
}

async function getText(url: string, accept: string): Promise<string> {
  const res = await fetch(url, { headers: { "user-agent": UA, accept }, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.text()).slice(0, 500_000);
}

// Never throws: a failed preview must not block the post.
export async function unfurl(url: string): Promise<Unfurl> {
  try {
    if (!/^https?:\/\//.test(url)) return {};
    if (new URL(url).hostname.replace(/^www\./, "") === "soundcloud.com") {
      return scParse(JSON.parse(await getText(`https://soundcloud.com/oembed?format=json&url=${encodeURIComponent(url)}`, "application/json")));
    }
    return ogParse(await getText(url, "text/html"), url);
  } catch (e) {
    console.error(`::warning::unfurl ${url} failed: ${(e as Error).message}`);
    return {};
  }
}
