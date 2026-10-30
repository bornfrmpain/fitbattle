// Chooses the primary product photo from a listing's photos.
// What it can judge: position (sellers usually lead with the full-garment cover shot),
// resolution, aspect ratio, and metadata/URL signals for avatars, logos and banners.
// What it can't judge: the actual picture content. It never looks for images elsewhere;
// it only orders the listing's own photos.

export interface ImageCandidate { url: string; width?: number | null; height?: number | null; kind?: string | null }
export interface ImageSelection {
  primary: string | null;
  ordered: string[]; // usable photos, primary first, then the rest in listing order
  rejected: { url: string; reason: string }[];
  method: "scored" | "order" | "player" | "none";
  note: string;
}

const NON_PRODUCT_KIND = /^(avatar|profile|seller|logo|brand|banner|icon|badge|placeholder)/i;
const NON_PRODUCT_URL = /(avatar|profile[_-]?(pic|photo|image)|\/logo|logo[_-]|favicon|\/icons?\/|sprite|badge|placeholder|default[_-]?image)/i;
export const MIN_SIDE = 400;

export function selectPrimaryImage(cands: ImageCandidate[]): ImageSelection {
  const rejected: ImageSelection["rejected"] = [];
  const seen = new Set<string>();
  const usable: (ImageCandidate & { pos: number; score: number })[] = [];
  cands.forEach((c, pos) => {
    if (!c.url || seen.has(c.url)) return;
    seen.add(c.url);
    if (!/^https:\/\//.test(c.url)) return rejected.push({ url: c.url, reason: "Not an https image link." });
    if (c.kind && NON_PRODUCT_KIND.test(c.kind)) return rejected.push({ url: c.url, reason: `Marked as ${c.kind}, not a product photo.` });
    if (NON_PRODUCT_URL.test(c.url)) return rejected.push({ url: c.url, reason: "Looks like an avatar, logo or placeholder." });
    const w = c.width ?? null, h = c.height ?? null;
    if (w && h) {
      const ratio = w / h;
      if (ratio > 2.0 || ratio < 0.4) return rejected.push({ url: c.url, reason: "Banner-shaped, unlikely to show the garment." });
    }
    usable.push({ ...c, pos, score: 0 });
  });
  if (!usable.length) return { primary: null, ordered: [], rejected, method: "none", note: cands.length ? "None of the listing's images looked like product photos." : "The source returned no photos." };

  const known = usable.filter((c) => c.width && c.height);
  const big = known.filter((c) => Math.min(c.width!, c.height!) >= MIN_SIDE);
  // Drop thumbnails, but only when a larger photo exists.
  const pool = big.length ? usable.filter((c) => !(c.width && c.height) || Math.min(c.width, c.height) >= MIN_SIDE) : usable;
  for (const c of usable) if (!pool.includes(c)) rejected.push({ url: c.url, reason: `Thumbnail (${c.width}×${c.height}).` });

  const allSmall = !big.length && known.length > 0;
  for (const c of pool) {
    let s = 0;
    if (c.width && c.height) {
      s += Math.log2(c.width * c.height) / 2; // resolution matters, with diminishing returns
      const r = c.width / c.height;
      s += r >= 0.6 && r <= 1.05 ? 2 : r >= 0.5 && r <= 1.4 ? 1 : 0; // portrait/square shows a whole garment
    }
    s += allSmall ? (c.pos === 0 ? 0.5 : 0) : c.pos === 0 ? 3 : c.pos === 1 ? 1 : 0; // the cover photo is the seller's pick; if every photo is small, resolution decides
    if (c.kind && /^(primary|cover|main|listing)/i.test(c.kind)) s += 2;
    c.score = s;
  }
  const best = [...pool].sort((a, b) => b.score - a.score || a.pos - b.pos)[0];
  const ordered = [best.url, ...pool.filter((c) => c !== best).sort((a, b) => a.pos - b.pos).map((c) => c.url)];
  const scored = known.length > 0;
  const lowRes = allSmall;
  return {
    primary: best.url, ordered, rejected, method: scored ? "scored" : "order",
    note: scored
      ? `Chosen from ${pool.length} photo${pool.length === 1 ? "" : "s"} by position, resolution and shape${lowRes ? "; every photo is small" : ""}.`
      : "Sizes unknown, so the seller's cover photo is used.",
  };
}
