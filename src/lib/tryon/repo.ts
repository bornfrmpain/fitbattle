import fs from "node:fs";
import path from "node:path";
import { DATA_DIR, db } from "../db";

// Photos and results live outside /public and are served only through
// authorization-checked routes. Originals, product images (the listing URLs in
// the outfit snapshot) and generated results are stored separately.
export const PRIVATE_DIR = path.join(DATA_DIR, "private");

export type Visibility = "private" | "opponent" | "public";
export interface PhotoRow { id: string; battle_id: string; seat: number; user_id: string; path: string; mime: string; consent_at: number; created_at: number }
export interface JobRow {
  id: string; photo_id: string; battle_id: string; seat: number; user_id: string; item_ids_json: string; plan_json: string;
  status: "queued" | "running" | "done" | "failed"; step: number; total_steps: number; step_label: string | null;
  visibility: Visibility; seed: number; result_path: string | null; error: string | null; created_at: number; updated_at: number;
}

export function writePrivate(name: string, buf: Buffer) {
  fs.mkdirSync(PRIVATE_DIR, { recursive: true });
  fs.writeFileSync(path.join(PRIVATE_DIR, path.basename(name)), buf, { mode: 0o600 });
  return path.basename(name);
}
export const readPrivate = (name: string) => fs.readFileSync(path.join(PRIVATE_DIR, path.basename(name)));
export const removePrivate = (name: string | null) => { if (name) fs.rmSync(path.join(PRIVATE_DIR, path.basename(name)), { force: true }); };

export const getPhoto = (id: string) => db().prepare("SELECT * FROM tryon_photos WHERE id = ?").get(id) as PhotoRow | undefined;
export const STALE_MS = 6 * 60_000;

export function getJob(id: string): JobRow | undefined {
  const j = db().prepare("SELECT * FROM tryon_jobs WHERE id = ?").get(id) as JobRow | undefined;
  // A job that stopped updating was interrupted (e.g. the server restarted mid-run).
  if (j && (j.status === "running" || j.status === "queued") && Date.now() - j.updated_at > STALE_MS) {
    updateJob(j.id, { status: "failed", error: "This run was interrupted. Retry to generate again." });
    return getJob(id);
  }
  return j;
}
export function updateJob(id: string, f: Partial<Pick<JobRow, "status" | "step" | "step_label" | "result_path" | "error">>) {
  const keys = Object.keys(f) as (keyof typeof f)[];
  db().prepare(`UPDATE tryon_jobs SET ${keys.map((k) => `${k} = ?`).join(", ")}, updated_at = ? WHERE id = ?`).run(...keys.map((k) => f[k] ?? null), Date.now(), id);
}
export const jobsForBattle = (battleId: string) =>
  (db().prepare("SELECT id FROM tryon_jobs WHERE battle_id = ? ORDER BY created_at DESC").all(battleId) as { id: string }[]).map((r) => getJob(r.id)!);

/** Owner sees everything; the opponent sees "opponent"/"public" results; anyone sees "public". */
export function canSeeResult(j: JobRow, viewerId: string | null, viewerIsPlayer: boolean) {
  if (viewerId && j.user_id === viewerId) return true;
  if (j.status !== "done") return false;
  return j.visibility === "public" || (j.visibility === "opponent" && viewerIsPlayer);
}

export function deletePhotoCascade(photo: PhotoRow) {
  const jobs = db().prepare("SELECT result_path FROM tryon_jobs WHERE photo_id = ?").all(photo.id) as { result_path: string | null }[];
  jobs.forEach((j) => removePrivate(j.result_path));
  removePrivate(photo.path);
  db().prepare("DELETE FROM tryon_jobs WHERE photo_id = ?").run(photo.id);
  db().prepare("DELETE FROM tryon_photos WHERE id = ?").run(photo.id);
}
