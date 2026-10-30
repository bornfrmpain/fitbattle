import { BattleError, submitSelection } from "@/lib/battle/rules";
import { loadBattle, mutateBattle, publicView } from "@/lib/battle/repo";
import { handle, json, readJson, requireUser } from "@/lib/http";
import { newId } from "@/lib/ids";
import { getProduct } from "@/lib/products";
import { withSelection } from "@/lib/products/feed";
import { probeMissing } from "@/lib/products/probes";
import type { Product } from "@/lib/products/types";

export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const receivedAt = Date.now();
  const { id } = await ctx.params;
  const user = await requireUser();
  const body = await readJson(req);
  const expectedTurn = Number(body.expectedTurn);
  if (!Number.isInteger(expectedTurn)) throw new BattleError("bad_turn", "Missing turn number.");

  if (!loadBattle(id)?.turns[expectedTurn]) throw new BattleError("bad_turn", "That turn doesn't exist.");

  // Price and availability always come from the server-side source, never the client.
  // Only listings from an authorized source, priced by that source, can enter a battle.
  if (body.manual) throw new BattleError("verified_only", "Only verified listings from the connected Grailed source can be locked in. Hand-entered pieces and prices aren't accepted in battles.", 422);
  let product: Product | null = await getProduct(String(body.productId ?? ""));
  if (!product) throw new BattleError("unavailable", "That listing can't be retrieved from the source right now. Pick another piece; your timer keeps running.", 409);
  if (product.source !== "feed") throw new BattleError("verified_only", "Only verified listings can be locked in.", 422);
  // Choose the main photo with real sizes, so a banner or thumbnail can't become it on any path.
  await probeMissing(product.imageCandidates ?? []);
  product = withSelection(product);
  // Keep the exact photo the player saw in the preview, if it belongs to this listing.
  const shown = typeof body.primaryImage === "string" ? body.primaryImage : null;
  if (shown && product.images.includes(shown) && shown !== product.imageUrl) {
    product = { ...product, imageUrl: shown, images: [shown, ...product.images.filter((u) => u !== shown)] };
  }
  const { state, result } = mutateBattle(id, (s, now) =>
    submitSelection(s, { actorId: user.id, expectedTurn, product: product, outfitItemId: newId("oi_"), now }), receivedAt);
  return json({ item: result, battle: publicView(state, user.id) });
});
