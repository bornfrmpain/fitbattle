// Remembers image dimensions (not the images) so photo selection is repeatable:
// the photo a player saw in the preview is the one that gets locked in.
import { db } from "../db";
import { probeImage } from "../images";
import type { ImageCandidate } from "./imageSelect";

const TTL = 7 * 86_400_000;

export function withCachedSizes(cands: ImageCandidate[]): ImageCandidate[] {
  if (!cands.length) return cands;
  const stmt = db().prepare("SELECT width, height, ok FROM image_probes WHERE url = ? AND probed_at > ?");
  return cands.map((c) => {
    if (c.width && c.height) return c;
    const row = stmt.get(c.url, Date.now() - TTL) as { width: number | null; height: number | null; ok: number } | undefined;
    return row?.ok ? { ...c, width: row.width, height: row.height } : c;
  });
}

/** Reads the header bytes of up to `max` photos that have no known size. */
export async function probeMissing(cands: ImageCandidate[], max = 8): Promise<ImageCandidate[]> {
  const cached = withCachedSizes(cands);
  const todo = cached.filter((c) => !(c.width && c.height)).slice(0, max);
  const ins = db().prepare("INSERT OR REPLACE INTO image_probes (url, width, height, ok, probed_at) VALUES (?, ?, ?, ?, ?)");
  await Promise.all(todo.map(async (c) => {
    const size = await probeImage(c.url);
    ins.run(c.url, size?.width ?? null, size?.height ?? null, size ? 1 : 0, Date.now());
  }));
  return withCachedSizes(cands);
}
