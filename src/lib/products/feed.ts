// Authorized Grailed listing data. Grailed's Terms of Service prohibit automated
// extraction from grailed.com and third-party tools without written consent, so this
// app never reads listing pages. Listing data, including photos, only comes from a
// source the operator is permitted to use:
//   GRAILED_FEED_URL / GRAILED_FEED_FILE   a bulk feed (JSON array)
//   GRAILED_LISTING_LOOKUP_URL             a per-listing endpoint, "{id}" = listing id
import fs from "node:fs/promises";
import { classifyText, CONDITIONS, isSubcategory, SUBCATEGORIES, toSlot, type Condition, type Slot } from "../categories";
import { applyQuery } from "./filter";
import { selectPrimaryImage, type ImageCandidate } from "./imageSelect";
import { parseGrailedListingUrl } from "./listingUrl";
import { withCachedSizes } from "./probes";
import type { Product, ProductProvider, SearchQuery } from "./types";

const TTL_MS = Number(process.env.GRAILED_FEED_TTL_SECONDS || 300) * 1000;
let cache: { at: number; items: Product[] } | null = null;
const lookupCache = new Map<string, { at: number; product: Product | null }>();

type FeedImage = string | { url: string; width?: number; height?: number; kind?: string; type?: string };
/** Expected record (documented in README). Unknown fields are ignored. */
export interface FeedRecord {
  id?: string | number; title: string; designer?: string | null; price_eur: number;
  slot?: string; subcategory?: string; size?: string | null; condition?: string | null; color?: string | null;
  images?: FeedImage[]; image_url?: string | null; listing_url: string; seller?: string | null; sold?: boolean; tags?: string[];
}

export function candidatesFrom(r: Pick<FeedRecord, "images" | "image_url">): ImageCandidate[] {
  const list: FeedImage[] = Array.isArray(r.images) && r.images.length ? r.images : r.image_url ? [r.image_url] : [];
  return list.map((i) => (typeof i === "string" ? { url: i } : { url: String(i.url), width: i.width ?? null, height: i.height ?? null, kind: i.kind ?? i.type ?? null }));
}

/** Applies photo selection using sizes from the record or from earlier probes. */
export function withSelection(p: Product): Product {
  const sel = selectPrimaryImage(withCachedSizes(p.imageCandidates ?? []));
  return { ...p, images: sel.ordered, imageUrl: sel.primary, imageSelection: { method: sel.method, note: sel.note } };
}

export function mapFeedRecord(r: FeedRecord): Product | null {
  const listing = parseGrailedListingUrl(String(r.listing_url ?? ""));
  if (!listing.ok || !r.title || !(Number(r.price_eur) > 0)) return null;
  const sub = isSubcategory(r.subcategory) ? r.subcategory : null;
  const guess = classifyText(`${r.title} ${listing.slug ?? ""}`);
  const slot: Slot | null = sub ? SUBCATEGORIES[sub].slot : toSlot(r.slot) ?? guess?.slot ?? null;
  if (!slot) return null;
  return withSelection({
    id: `feed:${listing.listingId}`, source: "feed", title: String(r.title).slice(0, 200), brand: r.designer ?? null,
    priceCents: Math.round(Number(r.price_eur) * 100), currency: "EUR", slot, subcategory: sub ?? (guess?.slot === slot ? guess.subcategory : null), size: r.size ?? null,
    condition: CONDITIONS.includes(r.condition as Condition) ? (r.condition as Condition) : null, color: r.color ?? null,
    imageUrl: null, images: [], imageSelection: null, imageCandidates: candidatesFrom(r),
    listingUrl: listing.url, seller: r.seller ?? null, available: r.sold !== true, tags: Array.isArray(r.tags) ? r.tags.map(String) : [],
  });
}

const authHeaders = (): Record<string, string> => (process.env.GRAILED_FEED_TOKEN ? { Authorization: `Bearer ${process.env.GRAILED_FEED_TOKEN}` } : {});

async function load(force = false): Promise<Product[]> {
  if (!process.env.GRAILED_FEED_URL && !process.env.GRAILED_FEED_FILE) return [];
  if (!force && cache && Date.now() - cache.at < TTL_MS) return cache.items.map(withSelection);
  let raw: string;
  if (process.env.GRAILED_FEED_URL) {
    const res = await fetch(process.env.GRAILED_FEED_URL, { headers: authHeaders(), signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`Feed responded ${res.status}`);
    raw = await res.text();
  } else {
    raw = await fs.readFile(process.env.GRAILED_FEED_FILE!, "utf8");
  }
  const parsed = JSON.parse(raw);
  const records: FeedRecord[] = Array.isArray(parsed) ? parsed : parsed.items ?? [];
  const items = records.map(mapFeedRecord).filter((p): p is Product => p !== null);
  cache = { at: Date.now(), items };
  return items;
}

/** Looks one listing up in the authorized sources. null = not available from any of them. */
export async function findListing(listingId: string, opts: { fresh?: boolean } = {}): Promise<Product | null> {
  const inFeed = (await load(opts.fresh)).find((p) => p.id === `feed:${listingId}`);
  if (inFeed) return inFeed;
  const tpl = process.env.GRAILED_LISTING_LOOKUP_URL;
  if (!tpl) return null;
  const hit = lookupCache.get(listingId);
  if (!opts.fresh && hit && Date.now() - hit.at < TTL_MS) return hit.product && withSelection(hit.product);
  const res = await fetch(tpl.replace("{id}", encodeURIComponent(listingId)), { headers: { Accept: "application/json", ...authHeaders() }, signal: AbortSignal.timeout(8000) });
  if (res.status === 404) { lookupCache.set(listingId, { at: Date.now(), product: null }); return null; }
  if (!res.ok) throw new Error(`Listing lookup responded ${res.status}`);
  const product = mapFeedRecord((await res.json()) as FeedRecord);
  const match = product && product.id === `feed:${listingId}` ? product : null;
  lookupCache.set(listingId, { at: Date.now(), product: match });
  return match;
}

/** A bulk feed can be searched; a per-listing lookup can only answer pasted links. */
export const searchableSourceConfigured = () => !!(process.env.GRAILED_FEED_URL || process.env.GRAILED_FEED_FILE);
export const authorizedSourceConfigured = () => !!(process.env.GRAILED_FEED_URL || process.env.GRAILED_FEED_FILE || process.env.GRAILED_LISTING_LOOKUP_URL);

export const feedProvider: ProductProvider = {
  source: "feed",
  label: "Authorized Grailed source",
  isConfigured: authorizedSourceConfigured,
  async search(q: SearchQuery) { return applyQuery((await load()).filter((p) => p.available !== false), q); },
  async get(id: string) { return id.startsWith("feed:") ? findListing(id.slice(5), { fresh: true }) : null; },
};
