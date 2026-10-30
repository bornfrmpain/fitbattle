import { BattleError } from "../battle/rules";
import { db } from "../db";
import { newId } from "../ids";
import { validateWheel, type WheelConfig } from "./model";

export const MAX_WHEELS_PER_USER = 100;
export interface SavedWheel extends WheelConfig { id: string; createdAt: number; updatedAt: number }

type Row = { id: string; title: string; mode: string; entries_json: string; created_at: number; updated_at: number };
const toWheel = (r: Row): SavedWheel => ({ id: r.id, title: r.title, mode: r.mode as WheelConfig["mode"], entries: JSON.parse(r.entries_json), createdAt: r.created_at, updatedAt: r.updated_at });

function valid(input: unknown): WheelConfig {
  const v = validateWheel(input);
  if (!v.ok) throw new BattleError("bad_wheel", v.errors.join(" "), 422);
  return v.wheel;
}

export const listWheels = (userId: string) =>
  (db().prepare("SELECT * FROM wheels WHERE user_id = ? ORDER BY updated_at DESC").all(userId) as Row[]).map(toWheel);

export function getWheel(userId: string, id: string): SavedWheel {
  const r = db().prepare("SELECT * FROM wheels WHERE id = ? AND user_id = ?").get(id, userId) as Row | undefined;
  if (!r) throw new BattleError("not_found", "Wheel not found.", 404);
  return toWheel(r);
}

export function createWheel(userId: string, input: unknown): SavedWheel {
  const w = valid(input);
  const n = (db().prepare("SELECT COUNT(*) AS n FROM wheels WHERE user_id = ?").get(userId) as { n: number }).n;
  if (n >= MAX_WHEELS_PER_USER) throw new BattleError("too_many", `You can save up to ${MAX_WHEELS_PER_USER} wheels. Delete one first.`, 409);
  const id = newId("w_"), now = Date.now();
  db().prepare("INSERT INTO wheels (id, user_id, title, mode, entries_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(id, userId, w.title, w.mode, JSON.stringify(w.entries), now, now);
  return getWheel(userId, id);
}

export function updateWheel(userId: string, id: string, input: unknown): SavedWheel {
  getWheel(userId, id); // ownership check
  const w = valid(input);
  db().prepare("UPDATE wheels SET title = ?, mode = ?, entries_json = ?, updated_at = ? WHERE id = ? AND user_id = ?")
    .run(w.title, w.mode, JSON.stringify(w.entries), Date.now(), id, userId);
  return getWheel(userId, id);
}

export function deleteWheel(userId: string, id: string) {
  getWheel(userId, id);
  db().prepare("DELETE FROM wheels WHERE id = ? AND user_id = ?").run(id, userId);
}
