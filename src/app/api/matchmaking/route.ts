import { createBattleState, joinBattle, parseConfig } from "@/lib/battle/rules";
import { publicView, saveBattle, waitingRandomBattle, loadBattle } from "@/lib/battle/repo";
import { tx } from "@/lib/db";
import { handle, json, readJson, requireUser } from "@/lib/http";
import { inviteCode, newId } from "@/lib/ids";

// Joins the oldest open random battle from another player (its host's rules apply),
// or opens a new one with this player's rules and waits for a real opponent.
export const POST = handle(async (req: Request) => {
  const user = await requireUser();
  const body = await readJson(req);
  const config = parseConfig({ ...(body.config as object), mode: "random" });
  const result = tx(() => {
    const openId = waitingRandomBattle(user.id);
    const now = Date.now();
    if (openId) {
      const s = loadBattle(openId)!;
      joinBattle(s, { userId: user.id, name: user.displayName }, now);
      saveBattle(s);
      return { state: s, matched: true };
    }
    const s = createBattleState({ id: newId("b_"), host: { userId: user.id, name: user.displayName }, config, inviteCode: inviteCode(), now });
    saveBattle(s, true);
    return { state: s, matched: false };
  });
  return json({ matched: result.matched, battle: publicView(result.state, user.id) });
});
