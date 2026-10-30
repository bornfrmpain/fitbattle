import type { Condition, Slot, Subcategory } from "../categories";

/**
 * Where a product record came from. This drives every "is this real?" label in the UI.
 *  - feed:   an authorized listing feed configured by the operator (live Grailed data)
 *  - manual: a Grailed listing URL plus details typed in by a player (not verified)
 *  - demo:   legacy only (battles saved by older versions); no demo items exist anymore
 */
export type ProductSource = "feed" | "manual" | "demo";

export interface Product {
  id: string; // stable id, prefixed by source: "feed:123", "manual:abc"
  source: ProductSource;
  title: string;
  brand: string | null;
  priceCents: number; // listed price in EUR cents, excluding shipping/fees
  currency: "EUR";
  slot: Slot;
  subcategory: Subcategory | null;
  size: string | null;
  condition: Condition | null;
  color: string | null;
  /** Primary photo (always images[0] when present). Demo items have none and are drawn. */
  imageUrl: string | null;
  /** All usable listing photos from the source, primary first. Never filled from other sources. */
  images: string[];
  /** Where the photos came from and how the primary was chosen; shown in the UI. */
  imageSelection: { method: "scored" | "order" | "player" | "none"; note: string } | null;
  /** Raw photo list from the source with any known sizes, kept so selection is reproducible. */
  imageCandidates?: { url: string; width?: number | null; height?: number | null; kind?: string | null }[];
  listingUrl: string | null; // Grailed listing URL when known
  seller: string | null;
  available: boolean | null; // null => unknown (manual entries)
  tags: string[];
}

export interface SearchQuery {
  q?: string;
  slot?: Slot;
  subcategory?: Subcategory;
  brand?: string;
  minPriceCents?: number;
  maxPriceCents?: number;
  size?: string;
  color?: string;
  condition?: Condition;
  sort?: "relevance" | "price_asc" | "price_desc";
  limit?: number;
}

export interface SearchResult {
  items: Product[];
  total: number;
  /** false = no searchable (bulk) authorized source; pieces can only be added by pasting links. */
  liveSource: boolean;
  sources: { source: ProductSource; label: string }[];
  notice: string | null;
}

export interface ProductProvider {
  readonly source: ProductSource;
  readonly label: string;
  isConfigured(): boolean;
  search(q: SearchQuery): Promise<Product[]>;
  /** Re-reads one item to confirm it still exists. null => no longer available. */
  get(id: string): Promise<Product | null>;
}

export const SOURCE_LABEL: Record<ProductSource, string> = {
  feed: "Live listing",
  manual: "Entered by player, not verified",
  demo: "Old demo item, not a real listing",
};

/** Fills image fields on snapshots saved before multi-photo support. */
export function normalizeProduct<T extends Product>(p: T): T {
  const images = Array.isArray(p.images) ? p.images : p.imageUrl ? [p.imageUrl] : [];
  return { ...p, images, imageUrl: images[0] ?? null, imageSelection: p.imageSelection ?? null };
}
