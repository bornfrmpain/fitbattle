// Wheel / Randomizer core. Pure and isomorphic: used by the browser, the API and tests.
//
// Geometry: the pointer sits at 12 o'clock. With wheel rotation R = 0, segment i covers the
// clockwise angles [i·s, (i+1)·s) measured from 12 o'clock, where s = 360 / n. Rotating the
// wheel clockwise by R moves the wheel angle (360 − R mod 360) under the pointer.
// The winner is drawn first, then the wheel is animated to a rotation inside that segment,
// so the displayed result and the segment under the pointer are the same by construction.

export type WheelMode = "price" | "brand" | "custom";
export const WHEEL_MODES: WheelMode[] = ["price", "brand", "custom"];
export const MODE_LABEL: Record<WheelMode, string> = { price: "Price Wheel", brand: "Brand Wheel", custom: "Custom Wheel" };

export interface WheelConfig { title: string; mode: WheelMode; entries: string[] }
export const LIMITS = { minEntries: 2, maxEntries: 100, maxEntryLength: 60, maxTitleLength: 60, maxShareChars: 12_000 } as const;

export const PRESETS: Record<WheelMode, WheelConfig[]> = {
  price: [
    { mode: "price", title: "Random Budget", entries: ["€10", "€25", "€50", "€100", "€250", "€500"] },
    { mode: "price", title: "Max price per piece", entries: ["€40", "€80", "€120", "€200"] },
  ],
  brand: [
    { mode: "brand", title: "Pick a Brand", entries: ["Rick Owens", "Balenciaga", "Chrome Hearts", "Supreme", "Nike"] },
    { mode: "brand", title: "Archive Brand", entries: ["Raf Simons", "Undercover", "Number (N)ine", "Helmut Lang", "Maison Margiela", "Comme des Garçons"] },
  ],
  custom: [
    { mode: "custom", title: "Fashion Challenge", entries: ["All black", "One vintage piece", "No logos", "Only one colour", "Statement shoes", "Thrift energy"] },
    { mode: "custom", title: "Choose My Outfit", entries: ["Tops", "Bottoms", "Shoes", "Miscellaneous"] },
    { mode: "custom", title: "Yes or No", entries: ["Yes", "No"] },
  ],
};
export const defaultWheel = (mode: WheelMode): WheelConfig => ({ ...PRESETS[mode][0], entries: [...PRESETS[mode][0].entries] });

/** Trims, normalizes and strips control/format characters. Emojis, symbols and accents are kept. */
export function cleanText(v: unknown, max: number): string {
  return String(v ?? "").normalize("NFC").replace(/[\p{Cc}\u2028\u2029\u202A-\u202E\u2066-\u2069]/gu, " ").replace(/\s+/g, " ").trim().slice(0, max);
}
/** Length in user-perceived characters, so one emoji counts once. */
export const charLength = (s: string) => Array.from(new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(s)).length;

/** Splits pasted text into entries, one per line, skipping blank lines. */
export function parseLines(text: string): string[] {
  return String(text ?? "").split(/\r?\n/).map((l) => cleanText(l, 10_000)).filter(Boolean);
}

export type ValidationResult = { ok: true; wheel: WheelConfig } | { ok: false; errors: string[] };

export function validateWheel(input: unknown): ValidationResult {
  const o = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const errors: string[] = [];
  const title = cleanText(o.title, 10_000);
  if (!title) errors.push("Give the wheel a title.");
  else if (charLength(title) > LIMITS.maxTitleLength) errors.push(`Titles can be up to ${LIMITS.maxTitleLength} characters.`);
  const mode = WHEEL_MODES.includes(o.mode as WheelMode) ? (o.mode as WheelMode) : "custom";
  const raw = Array.isArray(o.entries) ? o.entries : [];
  if (!Array.isArray(o.entries)) errors.push("The wheel has no entry list.");
  const entries: string[] = [];
  raw.forEach((e, i) => {
    if (typeof e !== "string" && typeof e !== "number") { errors.push(`Entry ${i + 1} isn't text.`); return; }
    const t = cleanText(e, 10_000);
    if (!t) errors.push(`Entry ${i + 1} is empty.`);
    else if (charLength(t) > LIMITS.maxEntryLength) errors.push(`Entry ${i + 1} is longer than ${LIMITS.maxEntryLength} characters.`);
    else entries.push(t); // duplicates are allowed on purpose: each copy is its own segment
  });
  if (raw.length < LIMITS.minEntries) errors.push(`A wheel needs at least ${LIMITS.minEntries} entries.`);
  if (raw.length > LIMITS.maxEntries) errors.push(`A wheel can have up to ${LIMITS.maxEntries} entries.`);
  return errors.length ? { ok: false, errors } : { ok: true, wheel: { title, mode, entries } };
}

/** Uniform random integer in [0, n) from a CSPRNG, using rejection sampling to avoid modulo bias. */
export function pickIndex(n: number, randomU32: () => number = secureU32): number {
  if (!Number.isInteger(n) || n < 1) throw new Error("pickIndex needs n ≥ 1");
  const limit = Math.floor(0x1_0000_0000 / n) * n;
  for (;;) { const x = randomU32(); if (x < limit) return x % n; }
}
function secureU32(): number {
  const a = new Uint32Array(1);
  globalThis.crypto.getRandomValues(a);
  return a[0];
}

const mod = (a: number, m: number) => ((a % m) + m) % m;
export const segmentAngle = (n: number) => 360 / n;

/** Index of the segment under the pointer for a wheel rotated clockwise by `rotation` degrees. */
export function indexAtRotation(rotation: number, n: number): number {
  const wheelAngle = mod(360 - mod(rotation, 360), 360);
  return Math.min(n - 1, Math.floor(wheelAngle / segmentAngle(n)));
}

/**
 * Final rotation that lands segment `index` under the pointer, at least `turns` full turns past
 * `current`. `offset` in [0, 1) picks where inside the segment it stops; it's kept away from the
 * edges (15%–85%) so the pointer never sits on a boundary.
 */
export function targetRotation(current: number, index: number, n: number, turns = 6, offset = 0.5): number {
  const s = segmentAngle(n);
  const within = 0.15 + 0.7 * Math.min(Math.max(offset, 0), 0.999999);
  const wheelAngle = (index + within) * s; // angle on the wheel that must end up at 12 o'clock
  const desired = mod(360 - wheelAngle, 360); // rotation (mod 360) that puts it there
  const delta = mod(desired - mod(current, 360), 360);
  return current + turns * 360 + delta;
}

/** Ease with a short acceleration and a long, smooth deceleration (cubic-bezier(.22,.02,.12,1)). */
export function spinEase(t: number): number {
  const p1x = 0.22, p1y = 0.02, p2x = 0.12, p2y = 1;
  const bx = (u: number) => 3 * (1 - u) * (1 - u) * u * p1x + 3 * (1 - u) * u * u * p2x + u * u * u;
  const by = (u: number) => 3 * (1 - u) * (1 - u) * u * p1y + 3 * (1 - u) * u * u * p2y + u * u * u;
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  let lo = 0, hi = 1, u = t;
  for (let i = 0; i < 40; i++) { u = (lo + hi) / 2; if (bx(u) < t) lo = u; else hi = u; }
  return by(u);
}

// ---- Share links: the configuration only, as validated JSON in base64url. Nothing is executed.
const toB64url = (bytes: Uint8Array) => {
  let bin = ""; bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const fromB64url = (s: string) => {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};

export function encodeShare(w: WheelConfig): string {
  return toB64url(new TextEncoder().encode(JSON.stringify({ v: 1, t: w.title, m: w.mode, e: w.entries })));
}
export function decodeShare(s: string): ValidationResult {
  if (!s || s.length > LIMITS.maxShareChars || !/^[A-Za-z0-9_-]+$/.test(s)) return { ok: false, errors: ["This wheel link is invalid or too long."] };
  let data: unknown;
  try { data = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(fromB64url(s))); }
  catch { return { ok: false, errors: ["This wheel link is damaged and can't be read."] }; }
  const d = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  if (d.v !== 1) return { ok: false, errors: ["This wheel link uses an unknown format."] };
  return validateWheel({ title: d.t, mode: d.m, entries: d.e });
}

/** "€120", "120 €", "€ 99.50", "120 EUR" → euro cents. null if the text isn't a euro amount. */
export function parseEuroAmount(text: string): number | null {
  const t = text.trim().replace(/\s+/g, " ");
  const m = t.match(/^(?:€ ?(\d{1,6}(?:[.,]\d{1,2})?)|(\d{1,6}(?:[.,]\d{1,2})?) ?(?:€|eur|euro|euros))$/i);
  if (!m) return null;
  const cents = Math.round(Number((m[1] ?? m[2]).replace(",", ".")) * 100);
  return cents >= 100 && cents <= 100_000_00 ? cents : null;
}
