import { addChallenge, challengesFor } from "@/lib/battle/challenges";
import { BattleError } from "@/lib/battle/rules";
import { readBattle } from "@/lib/battle/repo";
import { handle, json, readJson, requireUser } from "@/lib/http";

export const GET = handle(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => json({ challenges: challengesFor((await ctx.params).id) }));

export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const user = await requireUser();
  const battle = readBattle(id);
  if (!battle) throw new BattleError("not_found", "Battle not found.", 404);
  const b = await readJson(req);
  return json({ challenge: addChallenge(battle, user.id, { text: b.text, sourceTitle: b.sourceTitle }), challenges: challengesFor(id) }, 201);
});
