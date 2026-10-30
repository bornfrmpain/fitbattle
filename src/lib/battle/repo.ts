import { db, tx } from "../db";
import { applyExpiry, BattleError, seatsOf, spentCents, tally } from "./rules";
import type { BattleConfig, BattleState, OutfitItem, SeatIndex, Turn } from "./types";
import { normalizeProduct } from "../products/types";
import { challengesFor } from "./challenges";

type Row = Record<string, unknown>;

export function loadBattle(id: string): BattleState | null {
  const d = db();
  const b = d.prepare("SELECT * FROM battles WHERE id = ?").get(id) as Row | undefined;
  if (!b) return null;
  const players = d.prepare("SELECT seat, user_id, name FROM battle_players WHERE battle_id = ? ORDER BY seat").all(id) as Row[];
  const turns = (d.prepare("SELECT * FROM turns WHERE battle_id = ? ORDER BY idx").all(id) as Row[]).map((t): Turn => ({
    index: Number(t.idx), seat: Number(t.seat) as SeatIndex, slot: t.slot as Turn["slot"], status: t.status as Turn["status"],
    itemId: (t.outfit_item_id as string) ?? null, startedAt: (t.started_at as number) ?? null,
    deadline: (t.deadline as number) ?? null, endedAt: (t.ended_at as number) ?? null,
  }));
  const items = (d.prepare("SELECT * FROM outfit_items WHERE battle_id = ? ORDER BY turn_idx").all(id) as Row[]).map((r): OutfitItem => normalizeProduct({
    ...JSON.parse(r.snapshot_json as string), outfitItemId: r.id as string, seat: Number(r.seat) as SeatIndex,
    turnIndex: Number(r.turn_idx), lockedAt: Number(r.locked_at), soldSinceSelection: !!r.sold_since_selection,
  } as OutfitItem));
  const votes = (d.prepare("SELECT voter_id, seat, created_at FROM votes WHERE battle_id = ?").all(id) as Row[]).map((v) => ({
    voterId: v.voter_id as string, seat: Number(v.seat) as SeatIndex, createdAt: Number(v.created_at),
  }));
  const seat = (i: number) => {
    const p = players.find((x) => Number(x.seat) === i);
    return p ? { userId: p.user_id as string, name: p.name as string } : null;
  };
  const w = b.winner as string | null;
  return {
    id, hostUserId: b.host_user_id as string, config: JSON.parse(b.config_json as string) as BattleConfig,
    status: b.status as BattleState["status"], seats: [seat(0)!, seat(1)], turns, items, votes,
    currentTurn: Number(b.current_turn), winner: w === null ? null : w === "draw" ? "draw" : (Number(w) as SeatIndex),
    inviteCode: b.invite_code as string, inviteExpiresAt: Number(b.invite_expires_at),
    createdAt: Number(b.created_at), updatedAt: Number(b.updated_at),
  };
}

export function saveBattle(s: BattleState, isNew = false) {
  const d = db();
  const winner = s.winner === null ? null : String(s.winner);
  if (isNew) {
    d.prepare(`INSERT INTO battles (id, host_user_id, config_json, status, current_turn, winner, invite_code, invite_expires_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(s.id, s.hostUserId, JSON.stringify(s.config), s.status, s.currentTurn, winner,
      s.inviteCode, s.inviteExpiresAt, s.createdAt, s.updatedAt);
  } else {
    d.prepare("UPDATE battles SET status = ?, current_turn = ?, winner = ?, updated_at = ? WHERE id = ?")
      .run(s.status, s.currentTurn, winner, s.updatedAt, s.id);
  }
  const upsertPlayer = d.prepare("INSERT OR REPLACE INTO battle_players (battle_id, seat, user_id, name) VALUES (?, ?, ?, ?)");
  s.seats.forEach((p, i) => p && upsertPlayer.run(s.id, i, p.userId, p.name));
  const upsertTurn = d.prepare(`INSERT OR REPLACE INTO turns (battle_id, idx, seat, slot, status, outfit_item_id, started_at, deadline, ended_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  for (const t of s.turns) upsertTurn.run(s.id, t.index, t.seat, t.slot, t.status, t.itemId, t.startedAt, t.deadline, t.endedAt);
  const upsertItem = d.prepare(`INSERT INTO outfit_items (id, battle_id, seat, turn_idx, product_id, source, title, brand, price_cents, slot, listing_url, image_url, snapshot_json, locked_at, sold_since_selection)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET sold_since_selection = excluded.sold_since_selection, image_url = excluded.image_url, snapshot_json = excluded.snapshot_json`);
  for (const i of s.items) {
    const { outfitItemId, seat, turnIndex, lockedAt, soldSinceSelection, ...product } = i;
    upsertItem.run(outfitItemId, s.id, seat, turnIndex, product.id, product.source, product.title, product.brand, product.priceCents,
      product.slot, product.listingUrl, product.imageUrl, JSON.stringify(product), lockedAt, soldSinceSelection ? 1 : 0);
  }
  // The PRIMARY KEY (battle_id, voter_id) is a second line of defence against duplicate votes.
  const insVote = d.prepare("INSERT OR IGNORE INTO votes (battle_id, voter_id, seat, created_at) VALUES (?, ?, ?, ?)");
  for (const v of s.votes) insVote.run(s.id, v.voterId, v.seat, v.createdAt);
}

/** Load → settle expired turns → mutate → save, all inside one write transaction. */
export function mutateBattle<T>(id: string, fn: (s: BattleState, now: number) => T, nowOverride?: number): { state: BattleState; result: T } {
  return tx(() => {
    const s = loadBattle(id);
    if (!s) throw new BattleError("not_found", "Battle not found.", 404);
    // Deadlines are judged at the moment the request reached the server.
    const now = nowOverride ?? Date.now();
    applyExpiry(s, now);
    const result = fn(s, now);
    saveBattle(s);
    return { state: s, result };
  });
}

/** Reads a battle, persisting any deadlines that passed since the last write. */
export function readBattle(id: string): BattleState | null {
  const s = loadBattle(id);
  if (!s) return null;
  if (s.status === "active" && s.turns[s.currentTurn]?.deadline && Date.now() >= s.turns[s.currentTurn].deadline!) {
    return mutateBattle(id, () => null).state;
  }
  return s;
}

export function findByInvite(code: string): BattleState | null {
  const row = db().prepare("SELECT id FROM battles WHERE invite_code = ?").get(code.trim().toUpperCase()) as Row | undefined;
  return row ? readBattle(row.id as string) : null;
}

/** The view sent to clients. The invite code is only shown to the host while waiting. */
export function publicView(s: BattleState, viewerId: string | null) {
  const mySeats = viewerId ? seatsOf(s, viewerId) : [];
  const votedFor = viewerId ? s.votes.find((v) => v.voterId === viewerId)?.seat ?? null : null;
  const showTally = s.status === "complete";
  return {
    id: s.id, config: s.config, status: s.status, seats: s.seats, turns: s.turns, items: s.items, currentTurn: s.currentTurn,
    winner: s.winner, createdAt: s.createdAt,
    spent: [spentCents(s, 0), spentCents(s, 1)],
    votes: { count: s.votes.length, target: s.config.voteTarget, tally: showTally ? tally(s) : null, votedFor },
    viewer: { userId: viewerId, seats: mySeats, isHost: viewerId === s.hostUserId, canVote: !!viewerId && mySeats.length === 0 && votedFor === null && s.status === "voting" },
    invite: viewerId === s.hostUserId && s.status === "waiting" ? { code: s.inviteCode, expiresAt: s.inviteExpiresAt } : null,
    challenges: challengesFor(s.id).map(({ byUserId: _b, ...c }) => c),
    serverNow: Date.now(),
  };
}
export type BattleView = ReturnType<typeof publicView>;

export function battlesForUser(userId: string, limit = 50) {
  const ids = db().prepare(`SELECT DISTINCT b.id FROM battles b JOIN battle_players p ON p.battle_id = b.id
    WHERE p.user_id = ? ORDER BY b.created_at DESC LIMIT ?`).all(userId, limit) as Row[];
  return ids.map((r) => readBattle(r.id as string)!).filter(Boolean);
}

export function statsForUser(userId: string) {
  const rows = db().prepare(`SELECT b.winner, p.seat, b.config_json FROM battles b JOIN battle_players p ON p.battle_id = b.id
    WHERE p.user_id = ? AND b.status = 'complete'`).all(userId) as Row[];
  let wins = 0, losses = 0, draws = 0;
  for (const r of rows) {
    const mode = (JSON.parse(r.config_json as string) as BattleConfig).mode;
    if (mode === "solo" || mode === "local") continue; // only online battles count toward the record
    if (r.winner === "draw") draws++;
    else if (Number(r.winner) === Number(r.seat)) wins++;
    else losses++;
  }
  const played = wins + losses + draws;
  return { wins, losses, draws, played, winRate: played ? wins / played : null };
}

export function leaderboard(limit = 25) {
  const rows = db().prepare(`SELECT u.username, u.display_name,
      SUM(CASE WHEN b.winner = CAST(p.seat AS TEXT) THEN 1 ELSE 0 END) AS wins,
      SUM(CASE WHEN b.winner != CAST(p.seat AS TEXT) AND b.winner != 'draw' THEN 1 ELSE 0 END) AS losses,
      COUNT(*) AS played
    FROM battle_players p JOIN battles b ON b.id = p.battle_id JOIN users u ON u.id = p.user_id
    WHERE b.status = 'complete' AND json_extract(b.config_json, '$.mode') IN ('friend', 'random')
    GROUP BY u.id HAVING played > 0 ORDER BY wins DESC, played ASC LIMIT ?`).all(limit) as Row[];
  return rows.map((r) => ({ username: r.username as string, displayName: r.display_name as string, wins: Number(r.wins), losses: Number(r.losses), played: Number(r.played) }));
}

export function waitingRandomBattle(excludeUserId: string): string | null {
  const row = db().prepare(`SELECT id FROM battles WHERE status = 'waiting' AND host_user_id != ? AND invite_expires_at > ?
    AND json_extract(config_json, '$.mode') = 'random' ORDER BY created_at ASC LIMIT 1`).get(excludeUserId, Date.now()) as Row | undefined;
  return row ? (row.id as string) : null;
}
