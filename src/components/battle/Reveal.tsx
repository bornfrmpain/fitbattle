"use client";
import { useState } from "react";
import Link from "next/link";
import type { BattleView } from "@/lib/battle/repo";
import type { Brand } from "@/lib/brand";
import type { OutfitItem } from "@/lib/battle/types";
import { fmt } from "@/lib/battle/rules";
import { slotLabel } from "@/lib/categories";
import { post } from "@/lib/client";
import type { JobView } from "@/lib/tryon/view";
import { PriceTag, ProductImage } from "../ProductCard";
import { Avatar, BudgetBar, ChallengeList, Notice, Spinner, seatVar } from "../ui";
import { emptyLabel, InspectDialog, orderedSlots, slotState } from "./Outfit";
import { TryOnFlow, useTryOns } from "./TryOnFlow";
import { exportShareCard } from "./shareCard";

export function latestResult(jobs: JobView[] | undefined, seat: number) {
  return jobs?.find((j) => j.seat === seat && j.status === "done") ?? null;
}

function VoteSplit({ tally, names }: { tally: [number, number]; names: [string, string] }) {
  const total = tally[0] + tally[1] || 1;
  return (
    <div className="w-full max-w-xl">
      <div className="flex justify-between text-sm font-semibold"><span>{names[0]} · {tally[0]}</span><span>{tally[1]} · {names[1]}</span></div>
      <div className="mt-2 flex h-2.5 overflow-hidden rounded-full bg-white/15">
        <div style={{ width: `${(tally[0] / total) * 100}%`, background: "var(--brand-p1)" }} />
        <div style={{ width: `${(tally[1] / total) * 100}%`, background: "var(--brand-p2)" }} />
      </div>
    </div>
  );
}

export function Reveal({ view, apply, brand }: { view: BattleView; apply: (v: BattleView) => void; brand: Brand }) {
  const [inspect, setInspect] = useState<OutfitItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [flowSeat, setFlowSeat] = useState<0 | 1 | null>(null);
  const { data: tryons, reload } = useTryOns(view.id);
  const solo = view.config.mode === "solo";
  const seats: (0 | 1)[] = solo ? [0] : [0, 1];
  const done = view.status === "complete";
  const winner = done && view.winner !== "draw" && !solo ? (view.winner as 0 | 1) : null;
  const names: [string, string] = [view.seats[0]?.name ?? "Player 1", view.seats[1]?.name ?? "Player 2"];

  async function act(path: string, body?: unknown) {
    setBusy(true); setError(null);
    try { apply((await post<{ battle: BattleView }>(path, body)).battle); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  async function saveCard() {
    setExporting(true); setError(null);
    try {
      const blob = await exportShareCard(view, brand, (seat) => latestResult(tryons?.jobs, seat)?.id ?? null);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob); a.download = `fitduel-${view.id}.png`; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    } catch (e) { setError(`Couldn't create the image: ${(e as Error).message}`); }
    finally { setExporting(false); }
  }

  return (
    <div className="mx-auto max-w-[1440px] px-3 md:px-8 pb-20">
      {done && !solo ? (
        <section aria-live="polite" className="night rise relative mt-5 overflow-hidden rounded-[28px] px-6 py-10 md:px-12 md:py-14">
          <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full opacity-40 blur-3xl" style={{ background: winner === null ? "#8f8ca3" : seatVar(winner) }} />
          <div className="relative flex flex-wrap items-center gap-6">
            {winner !== null && <Avatar name={names[winner]} seat={winner} size={84} />}
            <div className="min-w-0">
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-white/60">{winner === null ? "Final result" : "Winner"}</p>
              <h1 className="display mt-2 text-5xl md:text-7xl">{winner === null ? "It's a draw" : names[winner]}</h1>
            </div>
          </div>
          {view.votes.tally && <div className="relative mt-8"><VoteSplit tally={view.votes.tally} names={names} /></div>}
        </section>
      ) : (
        <header className="mt-8">
          <p className="eyebrow">{solo ? "Practice complete" : "The reveal"}</p>
          <h1 className="display mt-2 text-5xl md:text-7xl">{solo ? "Your fit" : "Both fits are in"}</h1>
          {view.status === "voting" && !solo && (
            <div className="mt-5 max-w-md">
              <p className="text-mute">Judges are voting: <span className="num font-semibold text-ink">{view.votes.count} of {view.votes.target}</span>. Players can&rsquo;t vote in their own battle.</p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-mist"><div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${(view.votes.count / view.votes.target) * 100}%`, background: "linear-gradient(90deg, var(--brand-p1), var(--brand-p2))" }} /></div>
            </div>
          )}
        </header>
      )}

      {view.challenges.length > 0 && <div className="mt-6"><ChallengeList challenges={view.challenges} /></div>}
      <div className="mt-6 flex flex-wrap gap-2">
        {!solo && <button className="btn btn-quiet" onClick={async () => { await navigator.clipboard.writeText(`${location.origin}/battle/${view.id}`); setCopied(true); }}>{copied ? "Link copied" : "Copy judge link"}</button>}
        <Link className="btn btn-quiet" href={`/battle/${view.id}/stage`} target="_blank">Stream view ↗</Link>
        <button className="btn btn-quiet" onClick={saveCard} disabled={exporting}>{exporting ? <><Spinner /> Rendering</> : "Save result image"}</button>
        {view.status === "voting" && view.viewer.isHost && view.votes.count > 0 && <button className="btn btn-dark" disabled={busy} onClick={() => act(`/api/battles/${view.id}/close-voting`)}>Close voting</button>}
      </div>
      {error && <div className="mt-4"><Notice tone="error" title="Something went wrong">{error}</Notice></div>}

      <div className={`relative mt-10 grid gap-3 md:gap-x-28 md:gap-y-12 ${solo ? "max-w-2xl" : "grid-cols-2"}`}>
        {!solo && (
          <div aria-hidden className="night absolute left-1/2 top-6 z-20 hidden h-20 w-20 -translate-x-1/2 place-items-center rounded-full md:grid" style={{ boxShadow: "0 14px 34px -12px #12111ccc" }}>
            <span className="font-display text-sm font-bold md:text-2xl" style={{ background: "linear-gradient(135deg, var(--brand-p1), var(--brand-p2))", WebkitBackgroundClip: "text", color: "transparent" }}>VS</span>
          </div>
        )}
        {seats.map((seat) => {
          const p = view.seats[seat]!;
          const result = latestResult(tryons?.jobs, seat);
          const isWinner = winner === seat, isLoser = winner !== null && winner !== seat;
          const ownsSeat = view.viewer.seats.includes(seat);
          return (
            <section key={seat} aria-label={`${p.name}'s outfit`} className={`rise min-w-0 transition-[filter,opacity] duration-500 ${isLoser ? "opacity-75 saturate-50" : ""}`} style={{ animationDelay: `${seat * 0.12}s` }}>
              <div className="glass p-3 md:p-5" style={isWinner ? { boxShadow: `inset 0 0 0 2px ${seatVar(seat)}, 0 24px 60px -24px ${seatVar(seat)}` } : undefined}>
                <div className={`flex items-center gap-3 ${seat === 1 ? "md:flex-row-reverse md:text-right" : ""}`}>
                  <Avatar name={p.name} seat={seat} size={40} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-display text-base font-semibold md:text-2xl">{p.name}</p>
                    <p className="text-xs text-mute">{isWinner ? "Winner" : done && view.votes.tally && !solo ? `${view.votes.tally[seat]} ${view.votes.tally[seat] === 1 ? "vote" : "votes"}` : "Outfit total"}</p>
                  </div>
                  <p className="hidden font-display text-2xl font-semibold num md:block">{fmt(view.spent[seat])}</p>
                </div>
                <div className="mt-3"><BudgetBar spent={view.spent[seat]} budget={view.config.budgetCents} seat={seat} align={seat === 1 ? "right" : "left"} /></div>
              </div>

              {result && (
                <figure className="card relative mt-3 overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/api/tryon/jobs/${result.id}/image`} alt={`AI visualization of ${p.name} wearing this outfit`} className="aspect-[3/4] w-full object-cover" />
                  <figcaption className="absolute inset-x-2 bottom-2 rounded-xl bg-white/85 px-3 py-2 text-[11px] backdrop-blur md:text-xs">
                    <span className="font-semibold">AI visualization</span> · an approximation, not a fitting. The real pieces are below.
                  </figcaption>
                </figure>
              )}

              <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 md:gap-3">
                {orderedSlots(view.config.slots).map((slot) => {
                  const { turn, item } = slotState(view, seat, slot);
                  return (
                    <li key={slot}>
                      {item ? (
                        <button onClick={() => setInspect(item)} className="card lift block w-full overflow-hidden text-left">
                          <div data-item-art={item.outfitItemId} className="relative aspect-[4/5]">
                            <ProductImage product={item} eager refreshUrl={`/api/battles/${view.id}/items/${item.outfitItemId}/refresh-image`} />
                            <PriceTag cents={item.priceCents} className="absolute bottom-2 left-2" />
                          </div>
                          <div className="p-2.5 md:p-3">
                            <p className="eyebrow">{slotLabel(slot)}</p>
                            <p className="truncate text-sm font-semibold">{item.brand ?? "No designer listed"}</p>
                            <p className="hidden truncate text-xs text-mute md:block">{item.title}</p>
                          </div>
                        </button>
                      ) : (
                        <div className="flex aspect-[4/5] flex-col items-center justify-center gap-1 rounded-[20px] bg-mist/70 p-3 text-center">
                          <p className="eyebrow">{slotLabel(slot)}</p>
                          <p className="text-sm font-medium text-mute">{emptyLabel(turn?.status)}</p>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>

              <div className="mt-3 flex flex-col gap-2">
                {view.status === "voting" && !solo && (view.viewer.canVote ? (
                  <button className="btn !min-h-12 text-white" style={{ background: seatVar(seat), boxShadow: `0 10px 26px -12px ${seatVar(seat)}` }} disabled={busy}
                    onClick={() => act(`/api/battles/${view.id}/vote`, { seat })}>Vote {p.name}</button>
                ) : view.votes.votedFor === seat ? <p className="text-center text-sm font-semibold">You voted for this fit</p> : null)}
                {ownsSeat && tryons && <button className="btn btn-quiet" onClick={() => setFlowSeat(seat)}>{result ? "Try on again" : "Try on my fit"}</button>}
              </div>
            </section>
          );
        })}
      </div>

      {view.status === "voting" && !view.viewer.userId && <p className="mt-8 text-mute"><Link href={`/signin?next=/battle/${view.id}`} className="link text-ink">Sign in</Link> to vote. One vote per account.</p>}
      {view.status === "voting" && view.viewer.seats.length > 0 && !solo && <p className="mt-8 text-sm text-mute">Share the judge link with chat. Voting closes at {view.votes.target} votes{view.viewer.isHost ? ", or close it yourself once one vote is in" : ""}.</p>}

      {flowSeat !== null && tryons && <TryOnFlow key={flowSeat} view={view} seat={flowSeat} caps={tryons} open onClose={() => setFlowSeat(null)} onChange={reload} />}
      <InspectDialog battleId={view.id} item={inspect} onClose={() => setInspect(null)} canFlag={!!inspect && view.viewer.seats.includes(inspect.seat)}
        onFlag={async () => { if (inspect) { await act(`/api/battles/${view.id}/items/${inspect.outfitItemId}/sold`); setInspect(null); } }} />
    </div>
  );
}
