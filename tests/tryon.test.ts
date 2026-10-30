import { describe, expect, it } from "vitest";
import { planTryOn, sniffImage } from "@/lib/tryon/provider";
import { supportFor } from "@/lib/tryon/support";
import type { OutfitItem } from "@/lib/battle/types";
import type { Slot } from "@/lib/categories";

let n = 0;
const item = (slot: Slot, img: string | null = `https://img.example/${slot}.jpg`, source: OutfitItem["source"] = "manual"): OutfitItem => ({
  id: `x${++n}`, outfitItemId: `oi${n}`, source, title: `${slot} piece`, brand: "B", priceCents: 1000, currency: "EUR", slot, subcategory: null,
  size: null, condition: null, color: null, imageUrl: img, images: img ? [img] : [], imageSelection: null, listingUrl: null, seller: null, available: null, tags: [], seat: 0, turnIndex: n, lockedAt: 0, soldSinceSelection: false,
});

describe("try-on planning", () => {
  it("chains FASHN bottoms → top, then one edit pass for shoes and misc", () => {
    const plan = planTryOn([item("footwear"), item("top"), item("misc"), item("bottoms")], null, true);
    expect(plan.steps.map((s) => s.kind)).toEqual(["fashn", "fashn", "edit"]);
    expect(plan.steps.slice(0, 2).map((s) => s.items[0].category)).toEqual(["bottoms", "tops"]);
    expect(plan.steps[2].items.map((i) => i.slot)).toEqual(["footwear", "misc"]);
  });
  it("skips pieces without photos and explains why", () => {
    const plan = planTryOn([item("top", null, "demo"), item("bottoms", null)], null, true);
    expect(plan.steps).toHaveLength(0);
    expect(plan.skipped.map((s) => s.reason).sort()).toEqual(["Demo items have no product photo.", "No product photo was added for this piece."]);
  });
  it("respects the user's selection and the extras switch", () => {
    const a = item("top"), b = item("footwear");
    expect(planTryOn([a, b], [a.outfitItemId], true).skipped[0].reason).toBe("Left out by you.");
    expect(supportFor(b, false)).toMatchObject({ method: "none" });
    expect(planTryOn([a, b], null, false).steps).toHaveLength(1);
  });
  it("sniffs real image bytes instead of trusting the declared type", () => {
    expect(sniffImage(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(sniffImage(Buffer.from("GIF89a"))).toBeNull();
    expect(sniffImage(Buffer.from("<svg></svg>"))).toBeNull();
  });
});
