import { BattleError } from "@/lib/battle/rules";
import { loadBattle, mutateBattle } from "@/lib/battle/repo";
import { handle, json } from "@/lib/http";
import { findListing } from "@/lib/products/feed";

const lastTry = new Map<string, number>();

// When a stored photo URL stops loading, ask the authorized source for the listing's
// current photo URLs. Only the same listing's photos are used, never a lookalike.
export const POST = handle(async (_req: Request, ctx: { params: Promise<{ id: string; itemId: string }> }) => {
  const { id, itemId } = await ctx.params;
  const item = loadBattle(id)?.items.find((i) => i.outfitItemId === itemId);
  if (!item) throw new BattleError("not_found", "Item not found.", 404);
  if (item.source !== "feed") return json({ refreshed: false, reason: "This piece didn't come from an authorized source, so its photo can't be refreshed." });
  const key = `${id}:${itemId}`;
  if (Date.now() - (lastTry.get(key) ?? 0) < 60_000) return json({ refreshed: false, reason: "Refreshed recently. Try again in a minute." });
  lastTry.set(key, Date.now());
  const fresh = await findListing(item.id.slice(5), { fresh: true }).catch(() => null);
  if (!fresh || !fresh.images.length) return json({ refreshed: false, reason: "The source no longer has photos for this listing." });
  const same = fresh.images.length === item.images.length && fresh.images.every((u) => item.images.includes(u));
  if (same) return json({ refreshed: false, reason: "The source returned the same photo links, so there's nothing new to load." });
  const { result } = mutateBattle(id, (s) => {
    const it = s.items.find((i) => i.outfitItemId === itemId)!;
    const same = fresh.images.includes(it.imageUrl ?? "");
    it.images = same ? [it.imageUrl!, ...fresh.images.filter((u) => u !== it.imageUrl)] : fresh.images;
    it.imageUrl = it.images[0];
    it.imageCandidates = fresh.imageCandidates;
    it.imageSelection = fresh.imageSelection;
    return { images: it.images };
  });
  return json({ refreshed: true, images: result.images });
});
