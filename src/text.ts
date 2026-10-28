import { createHash } from "node:crypto";

export const hash = (s: string) => createHash("sha1").update(s).digest("hex").slice(0, 12);

const ENT: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

export const decode = (s: string) =>
  s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e: string) =>
    e[0] === "#"
      ? String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10))
      : ENT[e.toLowerCase()] ?? m);

// Tags are stripped before entities are decoded, so escaped "&lt;b&gt;" stays literal text.
export const htmlToText = (h: string) =>
  decode(
    h.replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|blockquote|li|h\d)>/gi, "\n\n")
      .replace(/<[^>]+>/g, ""),
  ).replace(/\n{3,}/g, "\n\n").trim();

// Largest srcset candidate when there is one (Tumblr's plain src is a 640px variant, srcset goes up to the full size), else src.
export const imagesOf = (h: string) => [...h.matchAll(/<img\b[^>]*>/gi)].flatMap(([tag]) => {
  const best = [...(tag.match(/srcset="([^"]+)"/i)?.[1] ?? "").matchAll(/(\S+)\s+(\d+)w/g)].sort((a, b) => +b[2] - +a[2])[0]?.[1];
  const url = best ?? tag.match(/\ssrc="([^"]+)"/i)?.[1];
  return url ? [decode(url)] : [];
});
