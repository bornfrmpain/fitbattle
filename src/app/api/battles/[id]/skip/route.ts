import { skipTurn } from "@/lib/battle/rules";
import { mutateBattle, publicView } from "@/lib/battle/repo";
import { handle, json, readJson, requireUser } from "@/lib/http";

export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const receivedAt = Date.now();
  const { id } = await ctx.params;
  const user = await requireUser();
  const b = await readJson(req);
  const { state } = mutateBattle(id, (s, now) => skipTurn(s, { actorId: user.id, expectedTurn: Number(b.expectedTurn), now }), receivedAt);
  return json({ battle: publicView(state, user.id) });
});
