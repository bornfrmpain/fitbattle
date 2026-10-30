import { fail, handle, json, requireUser } from "@/lib/http";
import { deletePhotoCascade, getPhoto, readPrivate } from "@/lib/tryon/repo";

// The original upload is only ever shown to the person who uploaded it.
export const GET = handle(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const photo = getPhoto((await ctx.params).id);
  if (!photo || photo.user_id !== user.id) return fail("not_found", "Not found.", 404);
  return new Response(new Uint8Array(readPrivate(photo.path)), { headers: { "Content-Type": photo.mime, "Cache-Control": "private, no-store" } });
});

export const DELETE = handle(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const photo = getPhoto((await ctx.params).id);
  if (!photo || photo.user_id !== user.id) return fail("not_found", "Not found.", 404);
  deletePhotoCascade(photo);
  return json({ ok: true });
});
