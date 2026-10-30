import { handle, json, readJson, requireUser } from "@/lib/http";
import { createJob } from "@/lib/tryon/jobs";
import type { Visibility } from "@/lib/tryon/repo";

export const POST = handle(async (req: Request) => {
  const user = await requireUser();
  const b = await readJson(req);
  const visibility: Visibility = b.visibility === "public" ? "public" : b.visibility === "opponent" ? "opponent" : "private";
  const itemIds = Array.isArray(b.itemIds) ? b.itemIds.map(String) : null;
  const { id, plan } = createJob({ userId: user.id, photoId: String(b.photoId ?? ""), itemIds, visibility, seed: b.seed === undefined ? undefined : Number(b.seed) });
  return json({ id, plan }, 202);
});
