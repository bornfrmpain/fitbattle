// "Paste a Grailed listing link": step 1 checks the link's format (no network); step 2
// asks the authorized source for the listing. Only a listing from that source, with its
// listed price, can enter a battle. Nothing is ever entered or priced by hand.
import { authorizedSourceConfigured, findListing, withSelection } from "./feed";
import { selectPrimaryImage } from "./imageSelect";
import { parseGrailedListingUrl, type ListingUrlError } from "./listingUrl";
import { probeMissing, withCachedSizes } from "./probes";
import type { Product } from "./types";

export type ResolveResult =
  | { status: "invalid_url"; code: ListingUrlError; message: string }
  | { status: "found"; listing: { id: string; url: string }; product: Product; rejected: { url: string; reason: string }[] }
  | { status: "no_source" | "not_found" | "source_error"; listing: { id: string; url: string }; message: string };

export async function resolveListingUrl(input: string): Promise<ResolveResult> {
  const parsed = parseGrailedListingUrl(input);
  if (!parsed.ok) return { status: "invalid_url", code: parsed.code, message: parsed.reason };
  const listing = { id: parsed.listingId, url: parsed.url };
  if (!authorizedSourceConfigured())
    return { status: "no_source", listing, message: "This app isn't connected to an authorized Grailed data source, so it can't retrieve this listing's price and photos. Battles only accept verified listing prices, so the piece can't be added yet." };
  let product: Product | null;
  try {
    product = await findListing(parsed.listingId, { fresh: true });
  } catch (e) {
    console.error("[resolve]", e);
    return { status: "source_error", listing, message: "The listing source didn't respond, so nothing was retrieved. Try again in a moment." };
  }
  if (!product)
    return { status: "not_found", listing, message: "The connected source doesn't have this listing. It may be sold, removed, or not included. Try another piece." };
  await probeMissing(product.imageCandidates ?? []);
  const detail = selectPrimaryImage(withCachedSizes(product.imageCandidates ?? []));
  return { status: "found", listing, product: withSelection(product), rejected: detail.rejected };
}
