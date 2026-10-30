import type { Product, SearchQuery } from "./types";

const norm = (s: string | null | undefined) => (s ?? "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "");

/** Applies a SearchQuery to an in-memory list. Used for the demo catalog and authorized feeds. */
export function applyQuery(items: Product[], q: SearchQuery): Product[] {
  const tokens = norm(q.q).split(/\s+/).filter(Boolean);
  const brand = norm(q.brand).trim();
  const size = norm(q.size).trim();
  const color = norm(q.color).trim();
  let out = items.filter((p) => {
    if (q.slot && p.slot !== q.slot) return false;
    if (q.subcategory && p.subcategory !== q.subcategory) return false;
    if (brand && !norm(p.brand).includes(brand)) return false;
    if (q.minPriceCents !== undefined && p.priceCents < q.minPriceCents) return false;
    if (q.maxPriceCents !== undefined && p.priceCents > q.maxPriceCents) return false;
    if (size && norm(p.size) !== size) return false;
    if (color && !norm(p.color).includes(color)) return false;
    if (q.condition && p.condition !== q.condition) return false;
    if (tokens.length) {
      const hay = norm([p.title, p.brand, p.color, p.subcategory, ...p.tags].join(" "));
      if (!tokens.every((t) => hay.includes(t))) return false;
    }
    return true;
  });
  if (q.sort === "price_asc") out = [...out].sort((a, b) => a.priceCents - b.priceCents);
  if (q.sort === "price_desc") out = [...out].sort((a, b) => b.priceCents - a.priceCents);
  return out;
}
