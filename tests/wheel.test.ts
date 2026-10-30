import { describe, expect, it } from "vitest";
import {
  charLength, decodeShare, encodeShare, indexAtRotation, LIMITS, parseEuroAmount, parseLines, pickIndex, spinEase, targetRotation, validateWheel,
} from "@/lib/wheel/model";

describe("pointer geometry", () => {
  it("the target rotation puts the chosen segment under the pointer, for every n (2–100) and index", () => {
    let checked = 0;
    for (let n = 2; n <= 100; n++) {
      for (let i = 0; i < n; i++) {
        for (const start of [0, 37.5, 359.9, 7200.25]) {
          for (const off of [0, 0.5, 0.999]) {
            const r = targetRotation(start, i, n, 6, off);
            expect(indexAtRotation(r, n)).toBe(i);
            expect(r - start).toBeGreaterThanOrEqual(6 * 360);
            checked++;
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(50_000);
  });
  it("never stops on a segment boundary", () => {
    for (let n = 2; n <= 100; n += 7) for (let i = 0; i < n; i++) {
      const s = 360 / n, r = targetRotation(0, i, n, 1, 0);
      const a = ((360 - (r % 360)) % 360) - i * s;
      expect(a).toBeGreaterThan(s * 0.1); expect(a).toBeLessThan(s * 0.9);
    }
  });
  it("easing starts at 0, ends at 1 and never runs backwards", () => {
    let prev = -1;
    for (let t = 0; t <= 1.0001; t += 0.01) { const v = spinEase(t); expect(v).toBeGreaterThanOrEqual(prev - 1e-9); prev = v; }
    expect(spinEase(0)).toBe(0); expect(spinEase(1)).toBe(1);
    expect(spinEase(0.05)).toBeLessThan(0.05); // gentle start (acceleration)
  });
});

describe("randomness", () => {
  it("is uniform: every entry, duplicates included, gets an equal share", () => {
    const n = 5, counts = Array(n).fill(0), N = 50_000;
    for (let k = 0; k < N; k++) counts[pickIndex(n)]++;
    for (const c of counts) expect(Math.abs(c - N / n)).toBeLessThan(N / n * 0.06);
  });
  it("rejects biased raw values (no modulo bias) and works for n = 2 and n = 100", () => {
    const seq = [0xffffffff, 7]; // the first exceeds the unbiased limit for n = 3 and must be redrawn
    expect(pickIndex(3, () => seq.shift()!)).toBe(1);
    for (let k = 0; k < 2000; k++) { expect(pickIndex(2)).toBeLessThan(2); expect(pickIndex(100)).toBeLessThan(100); }
  });
});

describe("validation", () => {
  const ok = (entries: unknown[], title = "Test") => validateWheel({ title, mode: "custom", entries });
  it("accepts 2 to 100 entries, duplicates, symbols, currencies and emojis", () => {
    expect(ok(["A", "B"]).ok).toBe(true);
    expect(ok(Array.from({ length: 100 }, (_, i) => `#${i}`)).ok).toBe(true);
    const r = ok(["€10", "$25", "£50", "¥1000", "🔥 Drip", "🔥 Drip", "Comme des Garçons"]);
    expect(r.ok && r.wheel.entries).toEqual(["€10", "$25", "£50", "¥1000", "🔥 Drip", "🔥 Drip", "Comme des Garçons"]);
  });
  it("rejects too few, too many, empty and overlong entries, and a missing title", () => {
    expect(ok(["Only one"]).ok).toBe(false);
    expect(ok(Array.from({ length: 101 }, (_, i) => `#${i}`)).ok).toBe(false);
    const r = ok(["A", "   ", "x".repeat(LIMITS.maxEntryLength + 1)], "");
    expect(!r.ok && r.errors.join(" ")).toMatch(/title.*Entry 2 is empty.*Entry 3 is longer/s);
    expect(validateWheel({ title: "T", entries: "A,B" }).ok).toBe(false);
    expect(validateWheel({ title: "T", entries: [{}, []] }).ok).toBe(false);
  });
  it("counts emoji as single characters and strips control characters", () => {
    expect(charLength("👩🏽‍🎤")).toBe(1);
    const r = ok(["a\u0000b", "\u202Eevil", "  spaced   out  "]);
    expect(r.ok && r.wheel.entries).toEqual(["a b", "evil", "spaced out"]);
  });
  it("splits pasted text one entry per line", () => {
    expect(parseLines("Rick Owens\r\n\n  Balenciaga \nChrome Hearts\n")).toEqual(["Rick Owens", "Balenciaga", "Chrome Hearts"]);
  });
});

describe("share links", () => {
  it("round-trips the exact configuration, including unicode", () => {
    const w = { title: "Pick a Brand 🔥", mode: "brand" as const, entries: ["Rick Owens", "Comme des Garçons", "€50", "Rick Owens"] };
    const r = decodeShare(encodeShare(w));
    expect(r.ok && r.wheel).toEqual(w);
  });
  it("rejects damaged, oversized, foreign and malicious payloads without running anything", () => {
    expect(decodeShare("!!not-base64!!").ok).toBe(false);
    expect(decodeShare("abc").ok).toBe(false);
    expect(decodeShare("A".repeat(LIMITS.maxShareChars + 1)).ok).toBe(false);
    const enc = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
    expect(decodeShare(enc({ v: 2, t: "x", e: ["a", "b"] })).ok).toBe(false);
    expect(decodeShare(enc({ v: 1, t: "x", e: ["a"] })).ok).toBe(false);
    const xss = decodeShare(enc({ v: 1, t: "<img src=x onerror=alert(1)>", m: "custom", e: ["<script>alert(1)</script>", "b"] }));
    expect(xss.ok && xss.wheel.entries[0]).toBe("<script>alert(1)</script>"); // kept as plain text; React renders it escaped
    expect(decodeShare(enc({ v: 1, t: "x", m: "evil", e: ["a", "b"] }))).toMatchObject({ ok: true, wheel: { mode: "custom" } });
  });
});

describe("price results", () => {
  it.each([["€120", 12000], ["120 €", 12000], ["€ 99,50", 9950], ["250 EUR", 25000], ["€500", 50000]])("%s → %i cents", (t, c) => expect(parseEuroAmount(t)).toBe(c));
  it.each(["$50", "50", "Rick Owens", "€0", "€0.50", "€999999"])("%s is not a usable euro budget", (t) => expect(parseEuroAmount(t)).toBeNull());
});
