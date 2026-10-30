import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseGrailedListingUrl } from "@/lib/products/listingUrl";

describe("Grailed listing URLs", () => {
  it("accepts listing links and normalizes them", () => {
    const r = parseGrailedListingUrl("http://grailed.com/listings/12345678-rick-owens-geobasket/?ref=x");
    expect(r).toEqual({ ok: true, url: "https://www.grailed.com/listings/12345678-rick-owens-geobasket", listingId: "12345678", slug: "rick-owens-geobasket" });
  });
  it.each([
    ["not a url", "single web address"],
    ["https://www.grailed.com.evil.io/listings/123456", "Only grailed.com"],
    ["https://www.grailed.com/designers/rick-owens", "designer page"],
    ["javascript:alert(1)", "https://"],
  ])("rejects %s", (url, msg) => {
    const r = parseGrailedListingUrl(url);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toMatch(msg);
  });
});

describe("authorized feed provider", () => {
  beforeAll(() => { process.env.GRAILED_FEED_FILE = path.join(__dirname, "fixtures/feed.json"); });
  afterAll(() => { delete process.env.GRAILED_FEED_FILE; });

  it("maps valid records, drops invalid ones, hides sold listings from search", async () => {
    const { searchProducts, getProduct } = await import("@/lib/products");
    const r = await searchProducts({ q: "fixture" });
    expect(r.items.map((i) => i.id)).toEqual(["feed:1000001"]);
    expect(r.notice).toBeNull();
    expect(r.items[0]).toMatchObject({ source: "feed", slot: "footwear", priceCents: 42000, listingUrl: "https://www.grailed.com/listings/1000001-fixture-boots", available: true, imageUrl: "https://example.com/a.jpg", images: ["https://example.com/a.jpg"] });
    expect((await getProduct("feed:1000002"))?.available).toBe(false); // re-check at pick time sees it's sold
    expect(await getProduct("feed:3")).toBeNull();
    expect(await getProduct("feed:1000004")).toBeNull(); // no category → dropped
  });
  it("search only ever returns authorized items; no demo catalog", async () => {
    const { searchProducts } = await import("@/lib/products");
    const r = await searchProducts({ slot: "footwear" });
    expect(r.liveSource).toBe(true);
    expect(r.items.every((i) => i.source === "feed")).toBe(true);
    delete process.env.GRAILED_FEED_FILE;
    const empty = await searchProducts({ slot: "bottoms" });
    expect(empty).toMatchObject({ items: [], total: 0, liveSource: false });
    process.env.GRAILED_FEED_FILE = path.join(__dirname, "fixtures/feed.json");
  });
});
