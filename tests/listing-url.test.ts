import { describe, expect, it } from "vitest";
import { parseGrailedListingUrl } from "@/lib/products/listingUrl";
import { classifyText } from "@/lib/categories";

const DIOR = "https://www.grailed.com/listings/106515727-dior-dior-homme-japan-kris-van-assche-dirty-washed-black-jeans";

describe("Grailed listing URL format (no network)", () => {
  it("accepts the exact Dior listing URL with its long slug", () => {
    expect(parseGrailedListingUrl(DIOR)).toEqual({ ok: true, url: DIOR, listingId: "106515727", slug: "dior-dior-homme-japan-kris-van-assche-dirty-washed-black-jeans" });
  });
  it.each([
    ["bare host", "https://grailed.com/listings/106515727-dior-jeans"],
    ["no scheme", "grailed.com/listings/106515727-dior-jeans"],
    ["http", "http://www.grailed.com/listings/106515727-dior-jeans"],
    ["whitespace", `  \n${DIOR}\t `],
    ["trailing slash", `${DIOR}/`],
    ["query + hash", `${DIOR}?g_aidx=Listing_production&g_aqid=abc#photos`],
    ["no slug", "https://www.grailed.com/listings/106515727"],
    ["encoded slug", "https://www.grailed.com/listings/106515727-caf%C3%A9-racer-jacket"],
    ["underscores and dots", "https://www.grailed.com/listings/106515727-dior_homme.04-jeans"],
    ["uppercase host", "https://WWW.GRAILED.COM/listings/106515727-x"],
  ])("accepts %s and normalizes it", (_n, url) => {
    const r = parseGrailedListingUrl(url);
    expect(r.ok).toBe(true);
    expect(r.ok && r.listingId).toBe("106515727");
    expect(r.ok && r.url).toMatch(/^https:\/\/www\.grailed\.com\/listings\/106515727[^?#/]*$/);
  });
  it.each([
    ["two URLs pasted together", DIOR + DIOR, "multiple_urls"],
    ["two URLs on separate lines", `${DIOR}\n${DIOR}`, "multiple_urls"],
    ["two URLs with a space", `${DIOR} https://www.grailed.com/listings/1234567-x`, "multiple_urls"],
    ["empty", "   ", "empty"],
    ["text with spaces", "not a link at all", "not_a_url"],
    ["other site", "https://www.vinted.com/listings/106515727-x", "not_grailed"],
    ["lookalike host", "https://www.grailed.com.evil.io/listings/106515727-x", "not_grailed"],
    ["search page", "https://www.grailed.com/shop?query=dior", "not_a_listing"],
    ["designer page", "https://www.grailed.com/designers/dior", "not_a_listing"],
    ["user profile", "https://www.grailed.com/someseller", "not_a_listing"],
    ["listing sub-page", `${DIOR}/edit`, "not_a_listing"],
    ["listings index", "https://www.grailed.com/listings", "not_a_listing"],
    ["no listing number", "https://www.grailed.com/listings/dior-homme-jeans", "bad_listing_id"],
    ["javascript", "javascript:alert(1)", "not_a_url"],
  ])("rejects %s", (_n, url, code) => {
    const r = parseGrailedListingUrl(url);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.code).toBe(code);
  });
  it("gives distinct, specific messages", () => {
    const msg = (u: string) => { const r = parseGrailedListingUrl(u); return r.ok ? "" : r.reason; };
    expect(msg(DIOR + DIOR)).toMatch(/one listing link at a time/);
    expect(msg("https://www.grailed.com/shop?query=dior")).toMatch(/search page/);
    expect(msg("https://www.grailed.com/someseller")).toMatch(/profile/);
  });
  it("slug classification still works for verified listings", () => {
    const r = parseGrailedListingUrl(DIOR);
    expect(classifyText(r.ok ? r.slug : "")).toEqual({ slot: "bottoms", subcategory: "denim" });
  });
});

describe("four-category model", () => {
  it.each([
    ["Raf Simons oversized hoodie", "top"], ["Zip-up hoodie", "top"], ["Levi's denim trucker jacket", "top"], ["Wool overcoat", "top"],
    ["Washed black jeans", "bottoms"], ["Cargo pants", "bottoms"], ["Geobasket high-top sneakers", "footwear"], ["Chelsea boots", "footwear"],
    ["Chrome Hearts trucker hat", "misc"], ["Leather tote bag", "misc"], ["Sterling cross pendant", "misc"],
  ])("%s → %s", (t, slot) => expect(classifyText(t)?.slot).toBe(slot));
});
