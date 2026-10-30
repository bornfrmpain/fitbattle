import { seatsOf } from "@/lib/battle/rules";
import { loadBattle } from "@/lib/battle/repo";
import { currentUser } from "@/lib/auth";
import { handle, json } from "@/lib/http";
import { extrasEnabled, PRICING, tryOnConfigured } from "@/lib/tryon/provider";
import { canSeeResult, jobsForBattle } from "@/lib/tryon/repo";
import { jobView } from "@/lib/tryon/view";

export const GET = handle(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const user = await currentUser();
  const battle = loadBattle(id);
  const base = { configured: tryOnConfigured(), extras: extrasEnabled(), pricing: PRICING };
  if (!battle) return json({ ...base, jobs: [] });
  const isPlayer = !!user && seatsOf(battle, user.id).length > 0;
  const jobs = jobsForBattle(id).filter((j) => canSeeResult(j, user?.id ?? null, isPlayer)).map((j) => jobView(j, user?.id ?? null));
  return json({ ...base, jobs });
});
