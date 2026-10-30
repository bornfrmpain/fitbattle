import { castVote } from "@/lib/battle/rules";
import { mutateBattle, publicView } from "@/lib/battle/repo";
import { handle, json, readJson, requireUser } from "@/lib/http";

export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const user = await requireUser();
  const b = await readJson(req);
  const { state } = mutateBattle(id, (s, now) => castVote(s, user.id, Number(b.seat) as 0 | 1, now));
  return json({ battle: publicView(state, user.id) });
});
