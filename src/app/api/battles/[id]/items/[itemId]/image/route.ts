import { loadBattle } from "@/lib/battle/repo";
import { fail, handle } from "@/lib/http";
import { fetchImage } from "@/lib/images";

// Same-origin copy of a locked-in product photo so the share-card export can draw it
// onto a canvas. Only URLs already in this battle's outfit snapshot are fetched.
export const GET = handle(async (_req: Request, ctx: { params: Promise<{ id: string; itemId: string }> }) => {
  const { id, itemId } = await ctx.params;
  const item = loadBattle(id)?.items.find((i) => i.outfitItemId === itemId);
  const urls = item ? (item.images?.length ? item.images : item.imageUrl ? [item.imageUrl] : []) : [];
  if (!urls.length) return fail("not_found", "No image.", 404);
  let last = "";
  for (const u of urls) {
    try {
      const { buf, type } = await fetchImage(u);
      // Passed through for the share-card canvas only; never written to disk.
      return new Response(new Uint8Array(buf), { headers: { "Content-Type": type, "Cache-Control": "private, max-age=300" } });
    } catch (e) { last = (e as Error).message; }
  }
  return fail("image_failed", last, 502);
});
