import { feedProvider, searchableSourceConfigured, withSelection } from "./feed";
import { probeMissing } from "./probes";
import type { Product, ProductProvider, SearchQuery, SearchResult } from "./types";

// Only authorized sources. There is no demo catalog: without a source, search is empty
// and players add pieces by pasting listing links.
const providers: ProductProvider[] = [feedProvider];
export const activeProviders = () => providers.filter((p) => p.isConfigured());
export const liveDataConfigured = () => feedProvider.isConfigured();

export async function searchProducts(q: SearchQuery): Promise<SearchResult> {
  const active = activeProviders();
  const limit = Math.min(q.limit ?? 48, 100);
  const results: Product[] = [];
  const failures: string[] = [];
  await Promise.all(active.map(async (p) => {
    try { results.push(...(await p.search(q))); }
    catch (e) { console.error(`[products] ${p.label} failed`, e); failures.push(p.label); }
  }));
  // Learn unknown photo sizes (cached) so search cards show the same main photo a lock-in would.
  const page = await Promise.all(results.slice(0, limit).map(async (p) => {
    if (!p.imageCandidates?.length) return p;
    await probeMissing(p.imageCandidates, 4);
    return withSelection(p);
  }));
  return {
    items: page, total: results.length, liveSource: searchableSourceConfigured(),
    notice: failures.length ? `${failures.join(", ")} couldn't be reached. Your turn is unaffected; paste a listing link instead.` : null,
    sources: active.map((p) => ({ source: p.source, label: p.label })),
  };
}

export async function getProduct(id: string): Promise<Product | null> {
  const provider = providers.find((p) => id.startsWith(`${p.source}:`) && p.isConfigured());
  return provider ? provider.get(id) : null;
}
