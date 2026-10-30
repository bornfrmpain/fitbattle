import { handle, json, readJson, requireUser } from "@/lib/http";
import { deleteWheel, getWheel, updateWheel } from "@/lib/wheel/repo";

type Ctx = { params: Promise<{ id: string }> };
export const GET = handle(async (_r: Request, ctx: Ctx) => json({ wheel: getWheel((await requireUser()).id, (await ctx.params).id) }));
export const PUT = handle(async (req: Request, ctx: Ctx) => {
  const user = await requireUser();
  return json({ wheel: updateWheel(user.id, (await ctx.params).id, await readJson(req)) });
});
export const DELETE = handle(async (_r: Request, ctx: Ctx) => {
  deleteWheel((await requireUser()).id, (await ctx.params).id);
  return json({ ok: true });
});
