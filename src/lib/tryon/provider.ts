// AI try-on pipeline on fal.ai.
//  1. FASHN v1.6 (dedicated try-on model): tops, bottoms, outerwear. One garment per
//     call, so calls are chained: bottoms → top → outerwear.
//  2. Optional "extras" pass: a general multi-image edit model (Nano Banana edit) gets
//     the step-1 result plus the real product photos of shoes, accessories and bags.
//     It is less faithful than FASHN and is labeled that way in the UI.
// Product photos are downloaded server-side from the locked-in listing snapshot and sent
// as data URIs, so the model receives exactly the selected garments.
import type { OutfitItem } from "../battle/types";
import { fetchImage, toDataUri } from "../images";
import { supportFor } from "./support";

export const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
const FASHN_ENDPOINT = () => process.env.FAL_TRYON_ENDPOINT || "https://fal.run/fal-ai/fashn/tryon/v1.6";
const EDIT_ENDPOINT = () => process.env.FAL_EDIT_ENDPOINT || "https://fal.run/fal-ai/nano-banana/edit";
export const tryOnConfigured = () => !!process.env.FAL_KEY;
export const extrasEnabled = () => process.env.TRYON_EXTRAS !== "off";

export const PRICING = {
  fashnPerGarmentUsd: 0.075, // fal.ai listing for fashn/tryon/v1.6
  editPerImageUsd: 0.039, // fal.ai listing for nano-banana/edit
};

export function sniffImage(buf: Buffer): "image/jpeg" | "image/png" | "image/webp" | null {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf.length > 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return null;
}

export interface PlanStep { kind: "fashn" | "edit"; label: string; items: { id: string; title: string; slot: string; imageUrl: string; category?: "tops" | "bottoms" }[] }
export interface Plan { steps: PlanStep[]; skipped: { id: string; title: string; reason: string }[] }

export function planTryOn(items: OutfitItem[], includeIds: string[] | null, extras = extrasEnabled()): Plan {
  const order: Record<string, number> = { bottoms: 0, top: 1, footwear: 2, misc: 3 };
  const steps: PlanStep[] = [];
  const skipped: Plan["skipped"] = [];
  const editItems: PlanStep["items"] = [];
  for (const item of [...items].sort((a, b) => order[a.slot] - order[b.slot])) {
    if (includeIds && !includeIds.includes(item.outfitItemId)) { skipped.push({ id: item.outfitItemId, title: item.title, reason: "Left out by you." }); continue; }
    const s = supportFor(item, extras);
    const ref = { id: item.outfitItemId, title: item.title, slot: item.slot, imageUrl: item.imageUrl! };
    if (s.method === "none") skipped.push({ id: item.outfitItemId, title: item.title, reason: s.reason });
    else if (s.method === "fashn") steps.push({ kind: "fashn", label: `Fitting ${item.slot}${item.brand ? ` · ${item.brand}` : ""}`, items: [{ ...ref, category: s.category }] });
    else editItems.push(ref);
  }
  if (editItems.length) steps.push({ kind: "edit", label: `Adding ${editItems.map((i) => (i.slot === "footwear" ? "shoes" : "misc")).join(" and ")}`, items: editItems });
  return { steps, skipped };
}

export class TryOnError extends Error {}

async function falCall(endpoint: string, body: unknown): Promise<string> {
  let res: Response;
  try {
    res = await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: `Key ${process.env.FAL_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(180_000),
    });
  } catch {
    throw new TryOnError("The try-on service didn't respond in time.");
  }
  if (!res.ok) {
    console.error("[tryon] provider error", res.status, (await res.text().catch(() => "")).slice(0, 400));
    if (res.status === 401 || res.status === 403) throw new TryOnError("The try-on service rejected the API key. Check FAL_KEY.");
    if (res.status === 422) throw new TryOnError("The try-on service couldn't use this photo or product image. Try a clearer full-body photo.");
    if (res.status === 429) throw new TryOnError("The try-on service is rate-limiting us. Wait a minute and retry.");
    throw new TryOnError(`The try-on service returned an error (${res.status}).`);
  }
  const data = (await res.json().catch(() => ({}))) as { images?: { url?: string }[] };
  const url = data.images?.[0]?.url;
  if (!url) throw new TryOnError("The try-on service returned no image.");
  return url;
}

async function garment(url: string): Promise<string> {
  try {
    const { buf, type } = await fetchImage(url);
    return toDataUri(buf, type);
  } catch (e) {
    throw new TryOnError(`Couldn't load a product photo: ${(e as Error).message}`);
  }
}

function editPrompt(items: PlanStep["items"]): string {
  const list = items.map((it, i) => `image ${i + 2} is the ${it.slot === "footwear" ? "pair of shoes" : "accessory"} "${it.title}"`).join("; ");
  return `Image 1 is a photo of a person. ${list}. Edit image 1 so the person is wearing or carrying exactly these products, matching their colour, material, shape and details as closely as possible. Keep the person's face, identity, skin, hair, body shape, pose, the clothing they already wear and the background unchanged. Photorealistic, same lighting.`;
}

/** Runs a plan. `onStep` is called before each step so callers can show progress. */
export async function runPlan(photo: Buffer, mime: string, plan: Plan, seed: number, onStep: (i: number, label: string) => void): Promise<Buffer> {
  if (!tryOnConfigured()) throw new TryOnError("AI try-on isn't configured on this server.");
  if (!plan.steps.length) throw new TryOnError("None of the selected pieces can be visualized.");
  let current = toDataUri(photo, mime);
  for (const [i, step] of plan.steps.entries()) {
    onStep(i, step.label);
    if (step.kind === "fashn") {
      const it = step.items[0];
      current = await falCall(FASHN_ENDPOINT(), {
        model_image: current, garment_image: await garment(it.imageUrl), category: it.category,
        mode: "balanced", garment_photo_type: "auto", num_samples: 1, seed, output_format: "jpeg",
      });
    } else {
      const garments = await Promise.all(step.items.map((it) => garment(it.imageUrl)));
      current = await falCall(EDIT_ENDPOINT(), { prompt: editPrompt(step.items), image_urls: [current, ...garments], num_images: 1 });
    }
  }
  try {
    const { buf } = await fetchImage(current);
    return buf;
  } catch (e) {
    throw new TryOnError(`Couldn't download the generated image: ${(e as Error).message}`);
  }
}
