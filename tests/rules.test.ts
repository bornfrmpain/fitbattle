import { describe, expect, it } from "vitest";
import {
  applyExpiry, buildTurns, castVote, createBattleState, hostCloseVoting, joinBattle, parseConfig, skipTurn, spentCents, submitSelection,
} from "@/lib/battle/rules";
import type { Product } from "@/lib/products/types";
import type { Slot } from "@/lib/categories";

const T0 = 1_700_000_000_000;
const host = { userId: "u1", name: "Ana" };
const guest = { userId: "u2", name: "Bo" };
let n = 0;
const p = (slot: Slot, priceEur: number, extra: Partial<Product> = {}): Product => ({
  id: `demo:${++n}`, source: "demo", title: `Item ${n}`, brand: "Atelier Null", priceCents: priceEur * 100, currency: "EUR",
  slot, subcategory: null, size: "M", condition: "used", color: "black", imageUrl: null, listingUrl: null, seller: null,
  available: true, tags: [], images: [], imageSelection: null, ...extra,
});

function battle(cfg: Record<string, unknown> = {}) {
  const config = parseConfig({ mode: "friend", timerSeconds: 30, budgetCents: 500_00, slots: ["top", "bottoms", "footwear"], ...cfg });
  const s = createBattleState({ id: "b1", host, config, inviteCode: "ABC123", now: T0 });
  if (config.mode === "friend" || config.mode === "random") joinBattle(s, guest, T0);
  return s;
}
const pick = (s: ReturnType<typeof battle>, actorId: string, product: Product, now: number) =>
  submitSelection(s, { actorId, expectedTurn: s.currentTurn, product, outfitItemId: `oi${++n}`, now });

describe("config", () => {
  it("accepts presets and custom timers, rejects nonsense", () => {
    expect(parseConfig({ mode: "friend", timerSeconds: null }).timerSeconds).toBeNull();
    expect(parseConfig({ mode: "friend", timerSeconds: 45 }).timerSeconds).toBe(45);
    expect(() => parseConfig({ mode: "friend", timerSeconds: 3 })).toThrow(/Turn timer/);
    expect(() => parseConfig({ mode: "friend", budgetCents: -5 })).toThrow(/Budget/);
    expect(() => parseConfig({ mode: "friend", theme: "budget", budgetCents: null })).toThrow(/needs a budget/);
    expect(() => parseConfig({ mode: "nope" })).toThrow();
  });
});

describe("turn order", () => {
  it("alternates per category so both players face the same category each round", () => {
    const t = buildTurns(parseConfig({ mode: "friend", slots: ["top", "bottoms"] }));
    expect(t.map((x) => `${x.seat}:${x.slot}`)).toEqual(["0:top", "1:top", "0:bottoms", "1:bottoms"]);
  });
  it("full-outfit order lets player 1 finish before player 2", () => {
    const t = buildTurns(parseConfig({ mode: "friend", slots: ["top", "bottoms"], turnOrder: "full" }));
    expect(t.map((x) => `${x.seat}:${x.slot}`)).toEqual(["0:top", "0:bottoms", "1:top", "1:bottoms"]);
  });
  it("rounds always run Tops → Bottoms → Shoes → Misc, whatever order or mode the client sends", () => {
    const cfg = parseConfig({ mode: "friend", slots: ["misc", "footwear", "top", "bottoms"], categoryMode: "random" });
    expect(cfg.slots).toEqual(["top", "bottoms", "footwear", "misc"]);
    expect(buildTurns(cfg, () => 0.99).map((t) => t.slot)).toEqual(["top", "top", "bottoms", "bottoms", "footwear", "footwear", "misc", "misc"]);
  });
  it("random category order is shared by both players", () => {
    const t = buildTurns(parseConfig({ mode: "friend", slots: ["top", "bottoms", "footwear"], categoryMode: "random" }), () => 0);
    for (let i = 0; i < t.length; i += 2) expect(t[i].slot).toBe(t[i + 1].slot);
  });
  it("solo practice has one seat", () => {
    expect(buildTurns(parseConfig({ mode: "solo", slots: ["top", "bottoms"] })).every((t) => t.seat === 0)).toBe(true);
  });
});

describe("selections", () => {
  it("locks picks, alternates players, and tracks spend", () => {
    const s = battle();
    pick(s, "u1", p("top", 120), T0 + 1000);
    expect(s.turns[1].seat).toBe(1);
    pick(s, "u2", p("top", 90), T0 + 2000);
    expect(spentCents(s, 0)).toBe(120_00);
    expect(spentCents(s, 1)).toBe(90_00);
  });
  it("rejects the wrong player", () => {
    const s = battle();
    expect(() => pick(s, "u2", p("top", 10), T0 + 1)).toThrow(/not your turn/);
  });
  it("rejects the wrong category", () => {
    const s = battle();
    expect(() => pick(s, "u1", p("footwear", 10), T0 + 1)).toThrow(/needs top/);
  });
  it("enforces budget", () => {
    const s = battle();
    pick(s, "u1", p("top", 450), T0 + 1);
    pick(s, "u2", p("top", 10), T0 + 2);
    expect(() => pick(s, "u1", p("bottoms", 51), T0 + 3)).toThrow(/€50 left/);
    pick(s, "u1", p("bottoms", 50), T0 + 4);
    expect(spentCents(s, 0)).toBe(500_00);
  });
  it("rejects unavailable listings and the same listing twice", () => {
    const s = battle();
    expect(() => pick(s, "u1", p("top", 10, { available: false }), T0 + 1)).toThrow(/no longer available/);
    const shared = p("top", 10, { listingUrl: "https://www.grailed.com/listings/1" });
    pick(s, "u1", shared, T0 + 2);
    expect(() => pick(s, "u2", { ...shared, id: "manual:x" }, T0 + 3)).toThrow(/opponent already locked/);
  });
  it("designer-only theme rejects unbranded items", () => {
    const s = battle({ theme: "designer" });
    expect(() => pick(s, "u1", p("top", 10, { brand: "Vintage" }), T0 + 1)).toThrow(/Designer-only/);
  });
  it("duplicate submissions for the same turn are rejected", () => {
    const s = battle();
    const turn = s.currentTurn;
    submitSelection(s, { actorId: "u1", expectedTurn: turn, product: p("top", 10), outfitItemId: "a", now: T0 + 1 });
    expect(() => submitSelection(s, { actorId: "u1", expectedTurn: turn, product: p("top", 11), outfitItemId: "b", now: T0 + 2 })).toThrow(/already ended/);
  });
});

describe("server-authoritative timer", () => {
  it("does not accept a pick after the deadline", () => {
    const s = battle();
    expect(s.turns[0].deadline).toBe(T0 + 30_000);
    expect(() => submitSelection(s, { actorId: "u1", expectedTurn: 0, product: p("top", 10), outfitItemId: "x", now: T0 + 30_000 })).toThrow(/Time ran out/);
    expect(s.turns[0].status).toBe("expired");
    expect(s.currentTurn).toBe(1);
  });
  it("the next turn starts at the previous deadline, not when someone comes back", () => {
    const s = battle();
    applyExpiry(s, T0 + 45_000); // player 1 went idle, player 2 is 15s into their turn
    expect(s.turns[1].startedAt).toBe(T0 + 30_000);
    expect(s.turns[1].deadline).toBe(T0 + 60_000);
  });
  it("re-reading state (a refresh) never extends a deadline", () => {
    const s = battle();
    const d = s.turns[0].deadline;
    applyExpiry(s, T0 + 10_000);
    applyExpiry(s, T0 + 20_000);
    expect(s.turns[0].deadline).toBe(d);
  });
  it("a late pick on the final turn still reports the deadline", () => {
    const s = battle({ slots: ["top"] });
    pick(s, "u1", p("top", 10), T0 + 1);
    expect(() => submitSelection(s, { actorId: "u2", expectedTurn: 1, product: p("top", 10), outfitItemId: "z", now: T0 + 31_000 })).toThrow(/Time ran out/);
    expect(s.status).toBe("voting");
  });
  it("cascades through several expired turns and ends in voting", () => {
    const s = battle();
    applyExpiry(s, T0 + 10 * 60_000);
    expect(s.turns.every((t) => t.status === "expired")).toBe(true);
    expect(s.status).toBe("voting");
  });
  it("no-timer battles never expire", () => {
    const s = battle({ timerSeconds: null });
    applyExpiry(s, T0 + 999_999_999);
    expect(s.status).toBe("active");
    expect(s.turns[0].deadline).toBeNull();
  });
  it("players can skip a category", () => {
    const s = battle();
    skipTurn(s, { actorId: "u1", expectedTurn: 0, now: T0 + 5 });
    expect(s.turns[0].status).toBe("skipped");
    expect(s.turns[1].startedAt).toBe(T0 + 5);
  });
});

describe("invites and voting", () => {
  it("expired invites can't be joined", () => {
    const config = parseConfig({ mode: "friend" });
    const s = createBattleState({ id: "b", host, config, inviteCode: "X", now: T0 });
    expect(() => joinBattle(s, guest, T0 + 25 * 3600_000)).toThrow(/expired/);
    expect(() => joinBattle(s, host, T0)).toThrow(/You created/);
  });
  it("blocks player votes and duplicates, closes at the target", () => {
    const s = battle({ voteTarget: 2, timerSeconds: null, slots: ["top"] });
    pick(s, "u1", p("top", 10), T0 + 1);
    pick(s, "u2", p("top", 10), T0 + 2);
    expect(s.status).toBe("voting");
    expect(() => castVote(s, "u1", 1, T0)).toThrow(/Players can't vote/);
    castVote(s, "j1", 1, T0);
    expect(() => castVote(s, "j1", 0, T0)).toThrow(/already voted/);
    castVote(s, "j2", 1, T0);
    expect(s.status).toBe("complete");
    expect(s.winner).toBe(1);
  });
  it("host can close early; ties are draws", () => {
    const s = battle({ timerSeconds: null, slots: ["top"] });
    pick(s, "u1", p("top", 10), T0 + 1);
    pick(s, "u2", p("top", 10), T0 + 2);
    expect(() => hostCloseVoting(s, "u1", T0)).toThrow(/at least one vote/);
    castVote(s, "j1", 0, T0);
    castVote(s, "j2", 1, T0);
    expect(() => hostCloseVoting(s, "u2", T0)).toThrow(/Only the battle host/);
    hostCloseVoting(s, "u1", T0);
    expect(s.winner).toBe("draw");
  });
  it("local battles start immediately with the host on both seats", () => {
    const s = createBattleState({ id: "l", host, config: parseConfig({ mode: "local", slots: ["top"] }), inviteCode: "L", now: T0, localOpponentName: "Kai" });
    expect(s.status).toBe("active");
    pick(s, "u1", p("top", 10), T0 + 1);
    pick(s, "u1", p("top", 10), T0 + 2);
    expect(s.status).toBe("voting");
  });
});
