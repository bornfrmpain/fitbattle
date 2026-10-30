import { describe, expect, it } from "vitest";
import { imageSize } from "@/lib/images";
import { selectPrimaryImage } from "@/lib/products/imageSelect";
import { candidatesFrom, mapFeedRecord } from "@/lib/products/feed";

describe("image size parsing", () => {
  it("reads PNG, JPEG and WebP headers", () => {
    const png = Buffer.alloc(32); png.writeUInt32BE(0x89504e47, 0); png.writeUInt32BE(1200, 16); png.writeUInt32BE(1600, 20);
    expect(imageSize(png)).toEqual({ width: 1200, height: 1600 });
    const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x03, 0x20, 0x02, 0x58, 0, 0, 0, 0, 0, 0, 0]);
    expect(imageSize(jpg)).toEqual({ width: 600, height: 800 });
    const webp = Buffer.alloc(32); webp.write("RIFF", 0); webp.write("WEBPVP8X", 8); webp.writeUIntLE(999, 24, 3); webp.writeUIntLE(1332, 27, 3);
    expect(imageSize(webp)).toEqual({ width: 1000, height: 1333 });
    expect(imageSize(Buffer.from("not an image"))).toBeNull();
  });
});

describe("primary photo selection", () => {
  const u = (n: string) => `https://img.example/${n}.jpg`;
  it("prefers the large portrait cover photo and keeps the rest in listing order", () => {
    const s = selectPrimaryImage([
      { url: u("cover"), width: 1200, height: 1600 }, { url: u("detail"), width: 1200, height: 1600 }, { url: u("tag"), width: 900, height: 900 },
    ]);
    expect(s.primary).toBe(u("cover"));
    expect(s.ordered).toEqual([u("cover"), u("detail"), u("tag")]);
    expect(s.method).toBe("scored");
  });
  it("skips a tiny thumbnail cover in favour of a real photo", () => {
    const s = selectPrimaryImage([{ url: u("thumb"), width: 150, height: 200 }, { url: u("big"), width: 1200, height: 1500 }]);
    expect(s.primary).toBe(u("big"));
    expect(s.rejected[0].reason).toMatch(/Thumbnail/);
  });
  it("rejects avatars, logos and banners by metadata, URL and shape", () => {
    const s = selectPrimaryImage([
      { url: u("seller"), kind: "avatar", width: 800, height: 800 },
      { url: "https://img.example/brand/logo.png", width: 800, height: 800 },
      { url: u("strip"), width: 2400, height: 600 },
      { url: u("garment"), width: 1000, height: 1250 },
    ]);
    expect(s.primary).toBe(u("garment"));
    expect(s.ordered).toEqual([u("garment")]);
    expect(s.rejected).toHaveLength(3);
  });
  it("falls back to the seller's order when sizes are unknown, and keeps small photos if that's all there is", () => {
    expect(selectPrimaryImage([{ url: u("a") }, { url: u("b") }])).toMatchObject({ primary: u("a"), method: "order" });
    expect(selectPrimaryImage([{ url: u("s1"), width: 200, height: 260 }, { url: u("s2"), width: 300, height: 390 }]).primary).toBe(u("s2"));
    expect(selectPrimaryImage([])).toMatchObject({ primary: null, method: "none" });
  });
  it("feed records carry every photo with the chosen primary first", () => {
    expect(candidatesFrom({ images: [u("x"), { url: u("y"), width: 10, height: 10, kind: "avatar" }] })).toHaveLength(2);
    const p = mapFeedRecord({ title: "Boots", price_eur: 300, subcategory: "boots", listing_url: "https://www.grailed.com/listings/555555",
      images: [{ url: u("thumb"), width: 120, height: 160 }, { url: u("full"), width: 1200, height: 1600 }, { url: u("sole"), width: 1200, height: 900 }] })!;
    expect(p.id).toBe("feed:555555");
    expect(p.imageUrl).toBe(u("full"));
    expect(p.images).toEqual([u("full"), u("sole")]);
  });
});
