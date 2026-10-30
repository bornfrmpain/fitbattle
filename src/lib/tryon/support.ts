// Which model can visualize which piece. Pure: used by the server pipeline and the UI.
import type { OutfitItem } from "../battle/types";

export type Support = { method: "fashn"; category: "tops" | "bottoms" } | { method: "edit" } | { method: "none"; reason: string };

export function supportFor(item: Pick<OutfitItem, "imageUrl" | "source" | "slot">, extras: boolean): Support {
  if (!item.imageUrl) return { method: "none", reason: item.source === "demo" ? "Demo items have no product photo." : "No product photo was added for this piece." };
  if (item.slot === "bottoms") return { method: "fashn", category: "bottoms" };
  if (item.slot === "top") return { method: "fashn", category: "tops" }; // includes jackets and coats
  if (!extras) return { method: "none", reason: "Shoes and miscellaneous pieces are turned off on this server." };
  return { method: "edit" };
}

export const SUPPORT_LABEL = {
  fashn: "Dedicated try-on model (FASHN)",
  edit: "General image editor, lower fidelity",
} as const;
