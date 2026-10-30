// The battle rules engine. Pure functions over BattleState with an explicit `now`
// so that the server is the only clock that matters and every rule is testable.
import { DEFAULT_SLOTS, SLOT_LABEL, toSlot, type Slot } from "../categories";
import type { Product } from "../products/types";
import type {
  BattleConfig, BattleMode, BattleState, CategoryMode, OutfitItem, SeatIndex, Theme, Turn, TurnOrder,
} from "./types";

export class BattleError extends Error {
  constructor(public code: string, message: string, public status = 400) {
    super(message);
  }
}

export const TIMER_PRESETS = [null, 15, 30, 60, 120] as const;
export const TIMER_MIN = 10;
export const TIMER_MAX = 600;
export const BUDGET_MAX_CENTS = 100_000_00;
export const INVITE_TTL_MS = 24 * 60 * 60 * 1000;
const UNBRANDED = new Set(["", "vintage", "unbranded", "unknown", "no brand", "streetwear", "japanese brand", "designer"]);

const MODES: BattleMode[] = ["friend", "random", "local", "solo"];
const THEMES: Theme[] = ["none", "archive", "dark", "high", "vintage", "budget", "designer", "custom"];

/** Validates untrusted input into a BattleConfig. Throws BattleError on bad input. */
export function parseConfig(input: unknown): BattleConfig {
  const o = (input ?? {}) as Record<string, unknown>;
  const mode = o.mode as BattleMode;
  if (!MODES.includes(mode)) throw new BattleError("bad_mode", "Choose a battle format.");

  let timerSeconds: number | null = null;
  if (o.timerSeconds !== null && o.timerSeconds !== undefined && o.timerSeconds !== "") {
    const t = Number(o.timerSeconds);
    if (!Number.isInteger(t) || t < TIMER_MIN || t > TIMER_MAX)
      throw new BattleError("bad_timer", `Turn timer must be a whole number of seconds from ${TIMER_MIN} to ${TIMER_MAX}, or no timer.`);
    timerSeconds = t;
  }

  let budgetCents: number | null = null;
  if (o.budgetCents !== null && o.budgetCents !== undefined && o.budgetCents !== "") {
    const b = Number(o.budgetCents);
    if (!Number.isInteger(b) || b < 1_00 || b > BUDGET_MAX_CENTS)
      throw new BattleError("bad_budget", "Budget must be between €1 and €100,000, or unlimited.");
    budgetCents = b;
  }

  const rawSlots = Array.isArray(o.slots) ? o.slots : DEFAULT_SLOTS;
  const slots: Slot[] = [];
  for (const raw of rawSlots) {
    const s = toSlot(raw); // legacy ids (outerwear, accessories, bags) map into the four categories
    if (!s) throw new BattleError("bad_slots", `Unknown category "${String(raw)}". Use Tops, Bottoms, Shoes or Miscellaneous.`);
    if (!slots.includes(s)) slots.push(s);
  }
  if (slots.length === 0) throw new BattleError("bad_slots", "Pick at least one category.");

  // Rounds always run Tops → Bottoms → Shoes → Miscellaneous, whatever order the client sends.
  slots.sort((a, b) => DEFAULT_SLOTS.indexOf(a) - DEFAULT_SLOTS.indexOf(b));
  const categoryMode: CategoryMode = "fixed";
  const turnOrder: TurnOrder = o.turnOrder === "full" ? "full" : "alternating";
  const theme = (THEMES.includes(o.theme as Theme) ? o.theme : "none") as Theme;
  const customTheme = theme === "custom" ? String(o.customTheme ?? "").trim().slice(0, 80) : null;
  if (theme === "custom" && !customTheme) throw new BattleError("bad_theme", "Describe your custom theme.");
  if (theme === "budget" && budgetCents === null)
    throw new BattleError("bad_theme", "“Best fit on a budget” needs a budget. Pick one or change the theme.");

  const voteTarget = Math.min(25, Math.max(1, Math.trunc(Number(o.voteTarget ?? 3)) || 3));
  return { mode, timerSeconds, budgetCents, slots, categoryMode, theme, customTheme, turnOrder, voteTarget };
}

/** Turn sequence. Each category is a "round" both players fill, so both always face the same category. */
export function buildTurns(config: BattleConfig, rng: () => number = Math.random): Turn[] {
  const order = [...config.slots].sort((a, b) => DEFAULT_SLOTS.indexOf(a) - DEFAULT_SLOTS.indexOf(b));
  void rng;
  const seats: SeatIndex[] = config.mode === "solo" ? [0] : [0, 1];
  const pairs: { seat: SeatIndex; slot: Slot }[] = [];
  if (config.turnOrder === "full" || seats.length === 1) {
    for (const seat of seats) for (const slot of order) pairs.push({ seat, slot });
  } else {
    for (const slot of order) for (const seat of seats) pairs.push({ seat, slot });
  }
  return pairs.map((p, index) => ({
    index, ...p, status: "pending", itemId: null, startedAt: null, deadline: null, endedAt: null,
  }));
}

export function createBattleState(args: {
  id: string; host: { userId: string; name: string }; config: BattleConfig; inviteCode: string; now: number;
  rng?: () => number; localOpponentName?: string;
}): BattleState {
  const { id, host, config, inviteCode, now } = args;
  const state: BattleState = {
    id, hostUserId: host.userId, config, status: "waiting",
    seats: [host, null], turns: buildTurns(config, args.rng), items: [], votes: [],
    currentTurn: 0, winner: null, inviteCode, inviteExpiresAt: now + INVITE_TTL_MS, createdAt: now, updatedAt: now,
  };
  if (config.mode === "local") {
    // Same-device battle: the host controls both seats. Labeled as local everywhere in the UI.
    state.seats[1] = { userId: host.userId, name: (args.localOpponentName || "Player 2").slice(0, 24) };
    start(state, now);
  } else if (config.mode === "solo") {
    start(state, now);
  }
  return state;
}

function activate(state: BattleState, index: number, at: number) {
  state.currentTurn = index;
  const turn = state.turns[index];
  if (!turn) return finish(state);
  turn.status = "active";
  turn.startedAt = at;
  turn.deadline = state.config.timerSeconds ? at + state.config.timerSeconds * 1000 : null;
}

function finish(state: BattleState) {
  state.currentTurn = state.turns.length;
  state.status = state.config.mode === "solo" ? "complete" : "voting";
}

function start(state: BattleState, now: number) {
  state.status = "active";
  activate(state, 0, now);
}

export function joinBattle(state: BattleState, user: { userId: string; name: string }, now: number): BattleState {
  if (state.status !== "waiting") throw new BattleError("not_waiting", "This battle already has two players.", 409);
  if (state.seats[0].userId === user.userId) throw new BattleError("own_battle", "You created this battle. Send the invite to your opponent.", 409);
  if (now > state.inviteExpiresAt) throw new BattleError("invite_expired", "This invitation has expired. Ask for a new one.", 410);
  state.seats[1] = user;
  start(state, now);
  state.updatedAt = now;
  return state;
}

/**
 * Applies every deadline that has passed. If several players are away, turns
 * expire in sequence: each next turn starts exactly at the previous deadline,
 * so nobody gains time by being offline or refreshing.
 */
export function applyExpiry(state: BattleState, now: number): boolean {
  let changed = false;
  while (state.status === "active") {
    const turn = state.turns[state.currentTurn];
    if (!turn || turn.deadline === null || now < turn.deadline) break;
    turn.status = "expired";
    turn.endedAt = turn.deadline;
    activate(state, state.currentTurn + 1, turn.deadline);
    changed = true;
  }
  if (changed) state.updatedAt = now;
  return changed;
}

export function seatsOf(state: BattleState, userId: string): SeatIndex[] {
  const out: SeatIndex[] = [];
  if (state.seats[0].userId === userId) out.push(0);
  if (state.seats[1]?.userId === userId) out.push(1);
  return out;
}

export function spentCents(state: BattleState, seat: SeatIndex): number {
  return state.items.filter((i) => i.seat === seat).reduce((s, i) => s + i.priceCents, 0);
}

function requireActiveTurn(state: BattleState, actorId: string, expectedTurn: number, now: number): Turn {
  applyExpiry(state, now);
  const expected = state.turns[expectedTurn];
  if (expected?.status === "expired" && seatsOf(state, actorId).includes(expected.seat))
    throw new BattleError("deadline_passed", "Time ran out before your pick arrived. That category was left empty.", 409);
  if (state.status !== "active") throw new BattleError("not_active", "Selections are closed for this battle.", 409);
  const turn = state.turns[state.currentTurn];
  if (expectedTurn !== state.currentTurn) throw new BattleError("stale_turn", "That turn has already ended.", 409);
  if (!seatsOf(state, actorId).includes(turn.seat)) throw new BattleError("not_your_turn", "It's not your turn.", 403);
  return turn;
}

/** Checks a product against every rule for the current turn without changing state. */
export function checkSelection(state: BattleState, seat: SeatIndex, slot: Slot, product: Product): void {
  if (product.slot !== slot)
    throw new BattleError("wrong_category", `This round needs ${SLOT_LABEL[slot].toLowerCase()}. That piece is listed as ${SLOT_LABEL[product.slot].toLowerCase()}.`);
  if (!Number.isInteger(product.priceCents) || product.priceCents <= 0)
    throw new BattleError("bad_price", "This item has no valid listed price.");
  if (product.available === false) throw new BattleError("unavailable", "That listing is no longer available. Pick another piece; your timer keeps running.", 409);
  const budget = state.config.budgetCents;
  if (budget !== null) {
    const remaining = budget - spentCents(state, seat);
    if (product.priceCents > remaining)
      throw new BattleError("over_budget", `That piece costs ${fmt(product.priceCents)} but you have ${fmt(remaining)} left.`, 422);
  }
  if (state.config.theme === "designer" && UNBRANDED.has((product.brand ?? "").trim().toLowerCase()))
    throw new BattleError("theme_rule", "Designer-only battle: this listing doesn't name a designer.", 422);
  const key = product.listingUrl ?? product.id;
  const taken = state.items.find((i) => (i.listingUrl ?? i.id) === key);
  if (taken) throw new BattleError("already_taken", taken.seat === seat ? "You already picked this piece." : "Your opponent already locked in this exact listing.", 409);
}

export function submitSelection(state: BattleState, args: {
  actorId: string; expectedTurn: number; product: Product; outfitItemId: string; now: number;
}): OutfitItem {
  const { now } = args;
  const turn = requireActiveTurn(state, args.actorId, args.expectedTurn, now);
  checkSelection(state, turn.seat, turn.slot, args.product);
  const item: OutfitItem = {
    ...args.product, outfitItemId: args.outfitItemId, seat: turn.seat, turnIndex: turn.index, lockedAt: now, soldSinceSelection: false,
  };
  state.items.push(item);
  turn.status = "filled";
  turn.itemId = item.outfitItemId;
  turn.endedAt = now;
  activate(state, turn.index + 1, now);
  state.updatedAt = now;
  return item;
}

export function skipTurn(state: BattleState, args: { actorId: string; expectedTurn: number; now: number }) {
  const turn = requireActiveTurn(state, args.actorId, args.expectedTurn, args.now);
  turn.status = "skipped";
  turn.endedAt = args.now;
  activate(state, turn.index + 1, args.now);
  state.updatedAt = args.now;
}

export function castVote(state: BattleState, voterId: string, seat: SeatIndex, now: number) {
  if (state.status !== "voting") throw new BattleError("voting_closed", state.status === "complete" ? "Voting has closed." : "Voting opens once both outfits are revealed.", 409);
  if (seat !== 0 && seat !== 1) throw new BattleError("bad_vote", "Vote for one of the two outfits.");
  if (seatsOf(state, voterId).length > 0) throw new BattleError("player_vote", "Players can't vote in their own battle. Share the link with judges.", 403);
  if (state.votes.some((v) => v.voterId === voterId)) throw new BattleError("duplicate_vote", "You've already voted in this battle.", 409);
  state.votes.push({ voterId, seat, createdAt: now });
  if (state.votes.length >= state.config.voteTarget) closeVoting(state);
  state.updatedAt = now;
}

export function tally(state: BattleState): [number, number] {
  return [state.votes.filter((v) => v.seat === 0).length, state.votes.filter((v) => v.seat === 1).length];
}

export function closeVoting(state: BattleState) {
  const [a, b] = tally(state);
  state.status = "complete";
  state.winner = a === b ? "draw" : a > b ? 0 : 1;
}

export function hostCloseVoting(state: BattleState, actorId: string, now: number) {
  if (actorId !== state.hostUserId) throw new BattleError("not_host", "Only the battle host can close voting.", 403);
  if (state.status !== "voting") throw new BattleError("voting_closed", "Voting isn't open.", 409);
  if (state.votes.length === 0) throw new BattleError("no_votes", "Wait for at least one vote before closing.", 409);
  closeVoting(state);
  state.updatedAt = now;
}

/** Owner flags a locked piece as sold after selection. The battle keeps the snapshot. */
export function markSold(state: BattleState, actorId: string, outfitItemId: string, now: number) {
  const item = state.items.find((i) => i.outfitItemId === outfitItemId);
  if (!item) throw new BattleError("not_found", "Item not found.", 404);
  if (!seatsOf(state, actorId).includes(item.seat)) throw new BattleError("forbidden", "Only the player who picked it can flag it.", 403);
  item.soldSinceSelection = true;
  state.updatedAt = now;
}

export function fmt(cents: number): string {
  return new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR", maximumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100);
}
