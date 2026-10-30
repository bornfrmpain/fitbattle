import { markSold } from "@/lib/battle/rules";
import { mutateBattle, publicView } from "@/lib/battle/repo";
import { handle, json, requireUser } from "@/lib/http";

export const POST = handle(async (_req: Request, ctx: { params: Promise<{ id: string; itemId: string }> }) => {
  const { id, itemId } = await ctx.params;
  const user = await requireUser();
  const { state } = mutateBattle(id, (s, now) => markSold(s, user.id, itemId, now));
  return json({ battle: publicView(state, user.id) });
});
