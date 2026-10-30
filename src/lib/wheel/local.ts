// Device-only storage for guests (localStorage). Everything read back is re-validated.
import { validateWheel, type WheelConfig } from "./model";
import type { SavedWheel } from "./repo";

const KEY = "fitduel.wheels.v1";
const DRAFT = "fitduel.wheel.draft.v1";

function read(): SavedWheel[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "[]");
    if (!Array.isArray(raw)) return [];
    return raw.flatMap((w) => {
      const v = validateWheel(w);
      return v.ok && typeof w.id === "string" ? [{ ...v.wheel, id: w.id, createdAt: Number(w.createdAt) || 0, updatedAt: Number(w.updatedAt) || 0 }] : [];
    });
  } catch { return []; }
}
function write(list: SavedWheel[]) { localStorage.setItem(KEY, JSON.stringify(list)); }

export const localWheels = {
  list: () => read().sort((a, b) => b.updatedAt - a.updatedAt),
  save(w: WheelConfig, id?: string): SavedWheel {
    const list = read(); const now = Date.now();
    const existing = id ? list.find((x) => x.id === id) : undefined;
    const saved: SavedWheel = { ...w, id: existing?.id ?? `local_${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`, createdAt: existing?.createdAt ?? now, updatedAt: now };
    write([saved, ...list.filter((x) => x.id !== saved.id)].slice(0, 100));
    return saved;
  },
  remove(id: string) { write(read().filter((x) => x.id !== id)); },
};

export interface Draft { wheel: WheelConfig; savedId: string | null; savedWhere: "cloud" | "local" | null; snapshot: string }
export const draftStore = {
  load(): Draft | null {
    try {
      const d = JSON.parse(localStorage.getItem(DRAFT) || "null");
      if (!d) return null;
      const v = validateWheel(d.wheel);
      // A draft may be mid-edit (e.g. an empty row); keep the raw entries but require the shape.
      if (!d.wheel || !Array.isArray(d.wheel.entries)) return null;
      return { wheel: v.ok ? v.wheel : { title: String(d.wheel.title ?? ""), mode: d.wheel.mode ?? "custom", entries: d.wheel.entries.map(String).slice(0, 100) },
        savedId: typeof d.savedId === "string" ? d.savedId : null, savedWhere: d.savedWhere === "cloud" || d.savedWhere === "local" ? d.savedWhere : null, snapshot: String(d.snapshot ?? "") };
    } catch { return null; }
  },
  save(d: Draft) { try { localStorage.setItem(DRAFT, JSON.stringify(d)); } catch { /* storage full or blocked */ } },
};
