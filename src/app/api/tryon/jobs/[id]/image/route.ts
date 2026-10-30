import { seatsOf } from "@/lib/battle/rules";
import { loadBattle } from "@/lib/battle/repo";
import { currentUser } from "@/lib/auth";
import { fail, handle } from "@/lib/http";
import { canSeeResult, getJob, readPrivate } from "@/lib/tryon/repo";

export const GET = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await currentUser();
  const j = getJob((await ctx.params).id);
  const battle = j ? loadBattle(j.battle_id) : null;
  if (!j || !battle || !j.result_path || !canSeeResult(j, user?.id ?? null, !!user && seatsOf(battle, user.id).length > 0)) return fail("not_found", "Not found.", 404);
  const headers: Record<string, string> = { "Content-Type": "image/jpeg", "Cache-Control": j.visibility === "public" ? "public, max-age=3600" : "private, no-store" };
  if (new URL(req.url).searchParams.get("download")) headers["Content-Disposition"] = `attachment; filename="fitduel-tryon-${j.id}.jpg"`;
  return new Response(new Uint8Array(readPrivate(j.result_path)), { headers });
});
