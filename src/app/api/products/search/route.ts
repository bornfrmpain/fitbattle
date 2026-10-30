import { CONDITIONS, isSlot, isSubcategory, type Condition } from "@/lib/categories";
import { handle, json } from "@/lib/http";
import { searchProducts } from "@/lib/products";
import type { SearchQuery } from "@/lib/products/types";

const euros = (v: string | null) => (v && Number(v) >= 0 ? Math.round(Number(v) * 100) : undefined);

export const GET = handle(async (req: Request) => {
  const p = new URL(req.url).searchParams;
  const q: SearchQuery = {
    q: p.get("q")?.slice(0, 120) || undefined,
    slot: isSlot(p.get("slot")) ? (p.get("slot") as SearchQuery["slot"]) : undefined,
    subcategory: isSubcategory(p.get("sub")) ? (p.get("sub") as SearchQuery["subcategory"]) : undefined,
    brand: p.get("brand")?.slice(0, 60) || undefined,
    minPriceCents: euros(p.get("min")),
    maxPriceCents: euros(p.get("max")),
    size: p.get("size")?.slice(0, 20) || undefined,
    color: p.get("color")?.slice(0, 30) || undefined,
    condition: CONDITIONS.includes(p.get("condition") as Condition) ? (p.get("condition") as Condition) : undefined,
    sort: (["price_asc", "price_desc"].includes(p.get("sort") ?? "") ? p.get("sort") : "relevance") as SearchQuery["sort"],
    limit: Number(p.get("limit")) || 48,
  };
  return json(await searchProducts(q));
});
