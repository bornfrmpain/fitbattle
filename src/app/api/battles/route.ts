import { createBattleState, parseConfig } from "@/lib/battle/rules";
import { battlesForUser, publicView, saveBattle } from "@/lib/battle/repo";
import { tx } from "@/lib/db";
import { handle, json, readJson, requireUser } from "@/lib/http";
import { inviteCode, newId } from "@/lib/ids";

export const POST = handle(async (req: Request) => {
  const user = await requireUser();
  const body = await readJson(req);
  const config = parseConfig(body.config);
  if (config.mode === "random") {
    return json({ error: { code: "use_matchmaking", message: "Random opponents are found through matchmaking." } }, 400);
  }
  const state = createBattleState({
    id: newId("b_"), host: { userId: user.id, name: user.displayName }, config, inviteCode: inviteCode(), now: Date.now(),
    localOpponentName: typeof body.localOpponentName === "string" ? body.localOpponentName.trim() : undefined,
  });
  tx(() => saveBattle(state, true));
  return json({ battle: publicView(state, user.id) }, 201);
});

export const GET = handle(async () => {
  const user = await requireUser();
  return json({ battles: battlesForUser(user.id).map((b) => publicView(b, user.id)) });
});
