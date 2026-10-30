// Challenges are announced conditions attached to a battle, e.g. a Wheel result like
// "Brand: Rick Owens". They're shown to players, judges and the stream view. They do NOT
// change any rule: budget, verified listings, rounds and timers stay server-enforced.
import { db } from "../db";
import { newId } from "../ids";
import { BattleError, seatsOf } from "./rules";
import type { BattleState } from "./types";

export const MAX_CHALLENGES = 10;
export const MAX_CHALLENGE_LENGTH = 100;

export interface Challenge { id: string; text: string; sourceTitle: string | null; byUserId: string; createdAt: number }

export function cleanText(v: unknown, max: number): string {
  return String(v ?? "").normalize("NFC").replace(/[\p{Cc}\p{Cf}]/gu, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

export function addChallenge(state: BattleState, userId: string, input: { text: unknown; sourceTitle?: unknown }): Challenge {
  if (!seatsOf(state, userId).length) throw new BattleError("forbidden", "Only the players in this battle can add challenges.", 403);
  if (state.status === "complete") throw new BattleError("battle_over", "This battle is finished.", 409);
  const text = cleanText(input.text, MAX_CHALLENGE_LENGTH);
  if (!text) throw new BattleError("bad_challenge", "The challenge is empty.");
  const n = (db().prepare("SELECT COUNT(*) AS n FROM battle_challenges WHERE battle_id = ?").get(state.id) as { n: number }).n;
  if (n >= MAX_CHALLENGES) throw new BattleError("too_many", `A battle can have up to ${MAX_CHALLENGES} challenges.`, 409);
  const c: Challenge = { id: newId("ch_"), text, sourceTitle: cleanText(input.sourceTitle, 60) || null, byUserId: userId, createdAt: Date.now() };
  db().prepare("INSERT INTO battle_challenges (id, battle_id, user_id, text, source_title, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .run(c.id, state.id, userId, c.text, c.sourceTitle, c.createdAt);
  return c;
}

export function challengesFor(battleId: string): Challenge[] {
  return (db().prepare("SELECT id, text, source_title, user_id, created_at FROM battle_challenges WHERE battle_id = ? ORDER BY created_at").all(battleId) as Record<string, unknown>[])
    .map((r) => ({ id: r.id as string, text: r.text as string, sourceTitle: (r.source_title as string) ?? null, byUserId: r.user_id as string, createdAt: Number(r.created_at) }));
}
