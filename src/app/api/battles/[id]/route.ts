import { currentUser } from "@/lib/auth";
import { publicView, readBattle } from "@/lib/battle/repo";
import { fail, handle, json } from "@/lib/http";

export const dynamic = "force-dynamic";
export const GET = handle(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const s = readBattle(id);
  if (!s) return fail("not_found", "Battle not found.", 404);
  const user = await currentUser();
  return json({ battle: publicView(s, user?.id ?? null) });
});
