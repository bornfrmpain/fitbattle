import { BattleError, seatsOf } from "@/lib/battle/rules";
import { loadBattle } from "@/lib/battle/repo";
import { db } from "@/lib/db";
import { handle, json, requireUser } from "@/lib/http";
import { newId } from "@/lib/ids";
import { MAX_PHOTO_BYTES, sniffImage, tryOnConfigured } from "@/lib/tryon/provider";
import { writePrivate } from "@/lib/tryon/repo";

const EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as const;

export const POST = handle(async (req: Request) => {
  const user = await requireUser();
  if (!tryOnConfigured()) throw new BattleError("tryon_disabled", "AI try-on isn't set up on this server (FAL_KEY is missing). Your outfit and battle are unaffected.", 503);
  const form = await req.formData().catch(() => { throw new BattleError("bad_form", "Upload a photo using the form."); });
  if (form.get("consent") !== "yes") throw new BattleError("consent_required", "Confirm that this is your photo, or that you have the person's permission, and that you agree to it being processed.");
  const battle = loadBattle(String(form.get("battleId") ?? ""));
  if (!battle) throw new BattleError("not_found", "Battle not found.", 404);
  const seat = Number(form.get("seat"));
  if (!(seatsOf(battle, user.id) as number[]).includes(seat)) throw new BattleError("forbidden", "You can only try on your own outfit.", 403);
  const mine = battle.turns.filter((t) => t.seat === seat);
  if (mine.some((t) => t.status === "pending" || t.status === "active")) throw new BattleError("too_early", "Finish your outfit first. Try-on opens when every category is done.", 409);

  const file = form.get("photo");
  if (!(file instanceof File) || file.size === 0) throw new BattleError("no_photo", "Choose a photo to upload.");
  if (file.size > MAX_PHOTO_BYTES) throw new BattleError("too_large", "Photos must be 8 MB or smaller.", 413);
  const buf = Buffer.from(await file.arrayBuffer());
  const mime = sniffImage(buf);
  if (!mime) throw new BattleError("bad_type", "Use a JPEG, PNG or WebP photo.", 415);

  const id = newId("tp_");
  const p = writePrivate(`${id}-photo.${EXT[mime]}`, buf);
  db().prepare("INSERT INTO tryon_photos (id, battle_id, seat, user_id, path, mime, consent_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .run(id, battle.id, seat, user.id, p, mime, Date.now(), Date.now());
  return json({ id }, 201);
});
