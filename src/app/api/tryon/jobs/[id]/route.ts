import { seatsOf } from "@/lib/battle/rules";
import { loadBattle } from "@/lib/battle/repo";
import { currentUser } from "@/lib/auth";
import { fail, handle, json } from "@/lib/http";
import { canSeeResult, getJob } from "@/lib/tryon/repo";
import { jobView } from "@/lib/tryon/view";

export const GET = handle(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await currentUser();
  const j = getJob((await ctx.params).id);
  const battle = j ? loadBattle(j.battle_id) : null;
  if (!j || !battle || !canSeeResult(j, user?.id ?? null, !!user && seatsOf(battle, user.id).length > 0)) return fail("not_found", "Not found.", 404);
  return json({ job: jobView(j, user?.id ?? null) });
});

