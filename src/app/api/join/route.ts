import { BattleError, joinBattle } from "@/lib/battle/rules";
import { findByInvite, mutateBattle, publicView } from "@/lib/battle/repo";
import { handle, json, readJson, requireUser } from "@/lib/http";

export const POST = handle(async (req: Request) => {
  const user = await requireUser();
  const b = await readJson(req);
  const found = findByInvite(String(b.code ?? ""));
  if (!found) throw new BattleError("bad_code", "No battle uses that invite code. Check it and try again.", 404);
  if (found.seats.some((s) => s?.userId === user.id)) return json({ battle: publicView(found, user.id) });
  const { state } = mutateBattle(found.id, (s, now) => joinBattle(s, { userId: user.id, name: user.displayName }, now));
  return json({ battle: publicView(state, user.id) });
});
