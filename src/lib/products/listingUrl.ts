// --- Listing URL format validation (no network access) -------------------------
// A URL that passes this only has the right *shape*. Whether the listing exists or can
// be retrieved is a separate question answered by the authorized source (resolve.ts).

export type ListingUrlError = "empty" | "multiple_urls" | "not_a_url" | "not_grailed" | "not_a_listing" | "bad_listing_id";
export type ListingUrlResult =
  | { ok: true; url: string; listingId: string; slug: string | null }
  | { ok: false; code: ListingUrlError; reason: string };

const GRAILED_HOSTS = new Set(["grailed.com", "www.grailed.com"]);

function fail(code: ListingUrlError, reason: string): ListingUrlResult { return { ok: false, code, reason }; }

export function parseGrailedListingUrl(input: string): ListingUrlResult {
  const raw = String(input ?? "").trim();
  if (!raw) return fail("empty", "Paste a Grailed listing link.");
  // Two links pasted together ("…jeanshttps://…") or several separated by spaces/newlines.
  const schemes = raw.match(/https?:\/\//gi)?.length ?? 0;
  const linkish = raw.split(/\s+/).filter((t) => /^(https?:\/\/|(www\.)?grailed\.com\/)/i.test(t)).length;
  if (schemes > 1 || linkish > 1) return fail("multiple_urls", "That looks like more than one link pasted together. Paste one listing link at a time.");
  if (/\s/.test(raw)) return fail("not_a_url", "That isn't a single web address. Paste just the listing link.");
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw) && !/^https?:\/\//i.test(raw)) return fail("not_a_url", "That isn't a web link. Use an https:// Grailed listing link.");
  let u: URL;
  try {
    u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`); // accept "grailed.com/listings/…" without scheme
  } catch {
    return fail("not_a_url", "That isn't a valid web address.");
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return fail("not_a_url", "Use an https:// link.");
  const host = u.hostname.toLowerCase().replace(/\.$/, "");
  if (!GRAILED_HOSTS.has(host)) return fail("not_grailed", "Only grailed.com listing links are accepted.");
  const segs = u.pathname.split("/").filter(Boolean);
  if (segs[0]?.toLowerCase() !== "listings" || segs.length !== 2) {
    const what = segs[0] === "shop" || segs[0] === "search" || u.searchParams.has("query") ? "a search page"
      : segs[0] === "designers" ? "a designer page" : segs[0] === "categories" ? "a category page"
      : segs.length === 0 ? "the homepage" : segs[0] === "listings" ? "not a single listing" : "a profile or other page";
    return fail("not_a_listing", `That's a Grailed link, but it's ${what}. Open the item itself and copy its link (grailed.com/listings/…).`);
  }
  let seg = segs[1];
  try { seg = decodeURIComponent(seg); } catch { /* keep the raw segment */ }
  const m = seg.match(/^(\d{4,12})(?:-(.*))?$/);
  if (!m) return fail("bad_listing_id", "That listing link has no listing number. Copy the link again from the item page.");
  // Normalized form: https, www host, no query string, fragment or trailing slash. The slug is kept as-is.
  return { ok: true, url: `https://www.grailed.com/listings/${segs[1]}`, listingId: m[1], slug: m[2] ? m[2] : null };
}
