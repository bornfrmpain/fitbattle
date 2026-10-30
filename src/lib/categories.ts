// Category taxonomy shared by the battle engine and product discovery.
// "Slots" are the outfit positions a battle asks for; "subcategories" are the
// finer browse filters a product can carry. Each subcategory belongs to one slot.

// Exactly four main categories. Outerwear (jackets, coats) counts as Tops; bags,
// jewellery, hats, belts and other accessories are Miscellaneous.
export const SLOTS = ["top", "bottoms", "footwear", "misc"] as const;
export type Slot = (typeof SLOTS)[number];

export const SLOT_LABEL: Record<Slot, string> = { top: "Tops", bottoms: "Bottoms", footwear: "Shoes", misc: "Miscellaneous" };
/** Plural / phrase forms for prose: "All tops", "Find a top". */
export const SLOT_PLURAL: Record<Slot, string> = { top: "tops", bottoms: "bottoms", footwear: "shoes", misc: "misc" };
export const SLOT_PHRASE: Record<Slot, string> = { top: "a top", bottoms: "bottoms", footwear: "shoes", misc: "a misc piece (bag, jewellery, hat, belt…)" };

export const DEFAULT_SLOTS: Slot[] = ["top", "bottoms", "footwear", "misc"];

/** Category ids used by earlier versions, mapped into the four-category model. */
export const LEGACY_SLOT: Record<string, Slot> = { outerwear: "top", accessories: "misc", bags: "misc" };
export function toSlot(v: unknown): Slot | null {
  if (typeof v !== "string") return null;
  if ((SLOTS as readonly string[]).includes(v)) return v as Slot;
  return LEGACY_SLOT[v] ?? null;
}
/** Label for any stored category id, including legacy ones in old battles. */
export const slotLabel = (v: string) => SLOT_LABEL[toSlot(v) ?? "misc"] ?? v;
/** Short label for tight spaces. */
export const slotShort = (v: string) => (toSlot(v) === "misc" ? "Misc." : slotLabel(v));

export const SUBCATEGORIES = {
  tshirts: { slot: "top", label: "T-shirts", keyword: "t-shirt" },
  hoodies: { slot: "top", label: "Hoodies & sweatshirts", keyword: "hoodie" },
  shirts: { slot: "top", label: "Shirts", keyword: "shirt" },
  knitwear: { slot: "top", label: "Knitwear", keyword: "sweater" },
  jackets: { slot: "top", label: "Jackets", keyword: "jacket" },
  coats: { slot: "top", label: "Coats", keyword: "coat" },
  denim: { slot: "bottoms", label: "Denim", keyword: "jeans" },
  trousers: { slot: "bottoms", label: "Trousers", keyword: "trousers" },
  shorts: { slot: "bottoms", label: "Shorts", keyword: "shorts" },
  sneakers: { slot: "footwear", label: "Sneakers", keyword: "sneakers" },
  boots: { slot: "footwear", label: "Boots", keyword: "boots" },
  shoes: { slot: "footwear", label: "Other shoes", keyword: "shoes" },
  bags: { slot: "misc", label: "Bags", keyword: "bag" },
  jewellery: { slot: "misc", label: "Jewellery", keyword: "ring" },
  hats: { slot: "misc", label: "Hats", keyword: "hat" },
  belts: { slot: "misc", label: "Belts", keyword: "belt" },
  eyewear: { slot: "misc", label: "Eyewear", keyword: "sunglasses" },
} as const satisfies Record<string, { slot: Slot; label: string; keyword: string }>;

export type Subcategory = keyof typeof SUBCATEGORIES;

// Garment nouns → subcategory. Matched as whole words; the LAST garment noun in a title
// wins, because it's the head noun ("Denim Jacket" is a jacket, "Washed Black Jeans" jeans).
const NOUNS: [RegExp, Subcategory][] = [
  [/^(tshirt|tees?|tank|tanks|longsleeve|polos?)$/, "tshirts"],
  [/^(hoodies?|hoody|hooded|sweatshirts?|crewnecks?|zipups?|pullovers?)$/, "hoodies"],
  [/^(shirts?|overshirts?|buttonups?|buttondowns?|flannels?|blouses?)$/, "shirts"],
  [/^(sweaters?|knit|knits|knitwear|cardigans?|jumpers?|mohair)$/, "knitwear"],
  [/^(jackets?|bombers?|blazers?|parkas?|anoraks?|puffers?|windbreakers?|vests?|gilets?|truckers?|varsity)$/, "jackets"],
  [/^(coats?|overcoats?|trench|trenchcoat|peacoat)$/, "coats"],
  [/^(jeans|denims?)$/, "denim"],
  [/^(pants|trousers|cargos?|chinos?|joggers?|sweatpants|slacks|bottoms|leggings|flares)$/, "trousers"],
  [/^(shorts|jorts|skirts?)$/, "shorts"],
  [/^(sneakers?|trainers?|runners?|geobaskets?|ramones|dunks?|hightops?|lowtops?)$/, "sneakers"],
  [/^(boots?|chelsea|chelseas)$/, "boots"],
  [/^(shoes?|loafers?|derbys?|derbies|oxfords?|sandals?|slides?|mules?|clogs?)$/, "shoes"],
  [/^(bags?|totes?|backpacks?|wallets?|pouch|duffle|duffel|messenger|crossbody)$/, "bags"],
  [/^(rings?|necklaces?|pendants?|bracelets?|chains?|earrings?|jewelry|jewellery|cuffs?)$/, "jewellery"],
  [/^(hats?|caps?|beanies?|bucket|balaclavas?)$/, "hats"],
  [/^(belts?|scarf|scarves|gloves?|socks|keychains?)$/, "belts"],
  [/^(sunglasses|glasses|eyewear|frames)$/, "eyewear"],
];

/** Classifies a listing title or URL slug. null = no garment noun recognized. */
export function classifyText(text: string | null | undefined): { slot: Slot; subcategory: Subcategory } | null {
  const t = String(text ?? "").toLowerCase().normalize("NFKD")
    .replace(/\bt[\s_-]?shirts?\b/g, " tshirt ")
    .replace(/\b(zip|button)[\s_-](up|ups|down|downs)\b/g, " $1$2 ")
    .replace(/\b(high|low)[\s_-](tops?)\b/g, " $1$2 ")
    .replace(/\blong[\s_-]?sleeves?\b/g, " longsleeve ");
  const words = t.replace(/[^\p{L}\p{N}]+/gu, " ").split(" ").filter(Boolean);
  let hit: Subcategory | null = null;
  for (const w of words) for (const [re, sub] of NOUNS) if (re.test(w)) hit = sub;
  return hit ? { slot: SUBCATEGORIES[hit].slot, subcategory: hit } : null;
}

export function isSlot(v: unknown): v is Slot {
  return typeof v === "string" && (SLOTS as readonly string[]).includes(v);
}
export function isSubcategory(v: unknown): v is Subcategory {
  return typeof v === "string" && v in SUBCATEGORIES;
}

export function subcategoriesForSlot(slot: Slot): Subcategory[] {
  return (Object.keys(SUBCATEGORIES) as Subcategory[]).filter((k) => SUBCATEGORIES[k].slot === slot);
}

/** Search keyword Grailed's own search understands for a slot. */
export const SLOT_KEYWORD: Record<Slot, string> = { top: "top", bottoms: "pants", footwear: "shoes", misc: "accessories" };

/**
 * Builds a link to Grailed's public search page. This only opens grailed.com in a
 * new tab for the player; we never fetch or parse the page ourselves.
 */
export function grailedSearchUrl(opts: { query?: string; slot?: Slot; subcategory?: Subcategory }): string {
  const parts: string[] = [];
  if (opts.query?.trim()) parts.push(opts.query.trim());
  if (opts.subcategory) parts.push(SUBCATEGORIES[opts.subcategory].keyword);
  else if (opts.slot && !opts.query?.trim()) parts.push(SLOT_KEYWORD[opts.slot]);
  const q = parts.join(" ").trim();
  return `https://www.grailed.com/shop${q ? `?query=${encodeURIComponent(q)}` : ""}`;
}

export const CONDITIONS = ["new", "gently_used", "used", "very_worn"] as const;
export type Condition = (typeof CONDITIONS)[number];
export const CONDITION_LABEL: Record<Condition, string> = {
  new: "New / never worn",
  gently_used: "Gently used",
  used: "Used",
  very_worn: "Very worn",
};
