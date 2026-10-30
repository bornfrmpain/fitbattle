import { BattleError, seatsOf } from "../battle/rules";
import { loadBattle } from "../battle/repo";
import { db } from "../db";
import { newId } from "../ids";
import { planTryOn, runPlan, TryOnError, type Plan } from "./provider";
import { getPhoto, readPrivate, updateJob, writePrivate, type Visibility } from "./repo";

const DAILY_LIMIT = () => Number(process.env.TRYON_DAILY_LIMIT || 12);

/** Validates and creates a job, then runs it in the background of this Node process. */
export function createJob(args: { userId: string; photoId: string; itemIds: string[] | null; visibility: Visibility; seed?: number }) {
  const photo = getPhoto(args.photoId);
  if (!photo || photo.user_id !== args.userId) throw new BattleError("not_found", "Upload a photo first.", 404);
  const battle = loadBattle(photo.battle_id);
  if (!battle) throw new BattleError("not_found", "Battle not found.", 404);
  if (!(seatsOf(battle, args.userId) as number[]).includes(photo.seat)) throw new BattleError("forbidden", "You can only try on your own outfit.", 403);
  if (args.visibility === "public" && battle.status === "waiting") throw new BattleError("bad_visibility", "Battle isn't public yet.");

  const d = db();
  const running = d.prepare("SELECT COUNT(*) AS n FROM tryon_jobs WHERE user_id = ? AND status IN ('queued','running') AND updated_at > ?").get(args.userId, Date.now() - 6 * 60_000) as { n: number };
  if (running.n > 0) throw new BattleError("busy", "A try-on is already generating. Wait for it to finish.", 429);
  const today = d.prepare("SELECT COUNT(*) AS n FROM tryon_jobs WHERE user_id = ? AND created_at > ?").get(args.userId, Date.now() - 86_400_000) as { n: number };
  if (today.n >= DAILY_LIMIT()) throw new BattleError("limit", `You've reached today's limit of ${DAILY_LIMIT()} try-ons.`, 429);

  const items = battle.items.filter((i) => i.seat === photo.seat);
  const plan = planTryOn(items, args.itemIds);
  if (!plan.steps.length) throw new BattleError("nothing_to_try", "None of the selected pieces can be visualized. The model needs product photos; demo items don't have any.", 422);

  const id = newId("tj_");
  const seed = Number.isInteger(args.seed) ? args.seed! : Math.floor(Math.random() * 2 ** 31);
  const now = Date.now();
  d.prepare(`INSERT INTO tryon_jobs (id, photo_id, battle_id, seat, user_id, item_ids_json, plan_json, status, step, total_steps, step_label, visibility, seed, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'queued', 0, ?, 'Queued', ?, ?, ?, ?)`).run(id, photo.id, battle.id, photo.seat, args.userId,
    JSON.stringify(args.itemIds), JSON.stringify(plan), plan.steps.length, args.visibility, seed, now, now);
  void run(id, photo.path, photo.mime, plan, seed);
  return { id, plan };
}

async function run(id: string, photoPath: string, mime: string, plan: Plan, seed: number) {
  try {
    updateJob(id, { status: "running", step: 0, step_label: plan.steps[0].label });
    const out = await runPlan(readPrivate(photoPath), mime, plan, seed, (i, label) => updateJob(id, { step: i, step_label: label }));
    updateJob(id, { status: "done", step: plan.steps.length, step_label: "Done", result_path: writePrivate(`${id}-result.jpg`, out) });
  } catch (e) {
    const message = e instanceof TryOnError ? e.message : "The try-on failed unexpectedly.";
    if (!(e instanceof TryOnError)) console.error("[tryon]", e);
    updateJob(id, { status: "failed", error: message });
  }
}
