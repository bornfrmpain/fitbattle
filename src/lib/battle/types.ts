import type { Slot } from "../categories";
import type { Product } from "../products/types";

export type BattleMode = "friend" | "random" | "local" | "solo";
export type TurnOrder = "alternating" | "full";
export type CategoryMode = "fixed" | "random";
export type Theme = "none" | "archive" | "dark" | "high" | "vintage" | "budget" | "designer" | "custom";

export interface BattleConfig {
  mode: BattleMode;
  /** Seconds per individual selection turn; null = no timer. */
  timerSeconds: number | null;
  /** Combined listed price limit in EUR cents; null = unlimited. */
  budgetCents: number | null;
  slots: Slot[];
  categoryMode: CategoryMode;
  theme: Theme;
  customTheme: string | null;
  turnOrder: TurnOrder;
  /** Spectator votes needed to close voting automatically. */
  voteTarget: number;
}

export type BattleStatus = "waiting" | "active" | "voting" | "complete";
export type TurnStatus = "pending" | "active" | "filled" | "skipped" | "expired";
export type SeatIndex = 0 | 1;

export interface Seat {
  userId: string;
  name: string;
}

export interface Turn {
  index: number;
  seat: SeatIndex;
  slot: Slot;
  status: TurnStatus;
  itemId: string | null;
  startedAt: number | null;
  deadline: number | null;
  endedAt: number | null;
}

/** A product snapshot frozen at the moment it was locked into an outfit. */
export interface OutfitItem extends Product {
  outfitItemId: string;
  seat: SeatIndex;
  turnIndex: number;
  lockedAt: number;
  soldSinceSelection: boolean;
}

export interface Vote {
  voterId: string;
  seat: SeatIndex;
  createdAt: number;
}

export interface BattleState {
  id: string;
  hostUserId: string;
  config: BattleConfig;
  status: BattleStatus;
  seats: [Seat, Seat | null];
  turns: Turn[];
  items: OutfitItem[];
  votes: Vote[];
  currentTurn: number; // index into turns; === turns.length when finished
  winner: SeatIndex | "draw" | null;
  inviteCode: string;
  inviteExpiresAt: number;
  createdAt: number;
  updatedAt: number;
}

export const THEME_INFO: Record<Theme, { label: string; enforced: boolean; description: string }> = {
  none: { label: "No theme", enforced: false, description: "Anything goes." },
  archive: { label: "Archive fashion", enforced: false, description: "Pieces from past seasons. Guidance only: listing data can't prove a season." },
  dark: { label: "Opium / dark streetwear", enforced: false, description: "Black, layered, aggressive silhouettes. Guidance only." },
  high: { label: "High fashion", enforced: false, description: "Runway and designer labels. Guidance only." },
  vintage: { label: "Vintage", enforced: false, description: "Older, pre-owned pieces. Guidance only." },
  budget: { label: "Best fit on a budget", enforced: true, description: "A budget is required and enforced on every pick." },
  designer: { label: "Designer only", enforced: true, description: "Every piece must name a designer. Unbranded and generic vintage items are rejected." },
  custom: { label: "Custom theme", enforced: false, description: "Your own brief. Guidance only; voters judge it." },
};
