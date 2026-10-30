import { hostCloseVoting } from "@/lib/battle/rules";
import { mutateBattle, publicView } from "@/lib/battle/repo";
import { handle, json, requireUser } from "@/lib/http";

export const POST = handle(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const user = await requireUser();
  const { state } = mutateBattle(id, (s, now) => hostCloseVoting(s, user.id, now));
  return json({ battle: publicView(state, user.id) });
});
