"use client";
import { useEffect, useRef, useState } from "react";
import type { BattleView } from "@/lib/battle/repo";
import type { Brand } from "@/lib/brand";
import { fmt } from "@/lib/battle/rules";
import { slotLabel, slotShort } from "@/lib/categories";
import { ProductImage } from "../ProductCard";
import { Avatar, TimerRing, seatVar } from "../ui";
import { useBattle } from "./BattleClient";
import { emptyLabel, orderedSlots, slotState } from "./Outfit";
import { latestResult } from "./Reveal";
import { useTryOns } from "./TryOnFlow";

// 16:9 stage for an OBS browser source. Everything scales with the stage width (w).
export function Stage({ initial, brand }: { initial: BattleView; brand: Brand }) {
  const { view, offset, refresh } = useBattle(initial);
  const { data: tryons, reload } = useTryOns(view.id);
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(1600);
  useEffect(() => { const t = setInterval(reload, 5000); return () => clearInterval(t); }, [reload]);
  useEffect(() => {
    const el = box.current; if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width)); ro.observe(el); return () => ro.disconnect();
  }, []);
  const u = (n: number) => (w * n) / 100; // percent of stage width, in px
  const turn = view.status === "active" ? view.turns[view.currentTurn] : null;
  const solo = view.config.mode === "solo";
  const seats: (0 | 1)[] = solo ? [0] : [0, 1];
  const winner = view.status === "complete" && view.winner !== "draw" && !solo ? (view.winner as 0 | 1) : null;
  const roundSize = solo || view.config.turnOrder === "full" ? 1 : 2;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-night">
      <div ref={box} className="relative aspect-video w-[min(100vw,177.78vh)] overflow-hidden"
        style={{ background: "radial-gradient(70% 70% at 0% 0%, #e4dbfe, transparent 60%), radial-gradient(60% 70% at 100% 100%, #d9e3ff, transparent 60%), #F5F4F9" }}>
        <div className="flex h-full flex-col" style={{ padding: u(1.8), gap: u(1.2) }}>
          <header className="flex items-center justify-between">
            <p className="font-display font-bold tracking-tight" style={{ fontSize: u(1.6) }}>
              {brand.appName.split("/")[0]}{brand.appName.includes("/") && <><span className="text-accent">/</span>{brand.appName.split("/")[1]}</>}
              {brand.streamerName && <span className="font-sans font-semibold text-mute" style={{ fontSize: u(1), marginLeft: u(0.8) }}>× {brand.streamerName}</span>}
            </p>
            <p className="font-semibold text-mute" style={{ fontSize: u(1.05) }}>
              {view.status === "active" && turn ? `Round ${Math.floor(view.currentTurn / roundSize) + 1} of ${Math.ceil(view.turns.length / roundSize)}`
                : view.status === "voting" ? `Voting · ${view.votes.count} of ${view.votes.target}` : view.status === "complete" ? "Final" : "Waiting for opponent"}
            </p>
          </header>

          {view.challenges.length > 0 && (
            <div className="flex flex-wrap" style={{ gap: u(0.6) }}>
              {view.challenges.map((c) => <span key={c.id} className="rounded-lg bg-white font-medium shadow-[var(--shadow-soft)]" style={{ fontSize: u(0.95), padding: `${u(0.25)}px ${u(0.7)}px` }}><span className="font-semibold text-accent">Challenge</span> · {c.text}</span>)}
            </div>
          )}
          <div className="relative grid min-h-0 flex-1" style={{ gridTemplateColumns: seats.length === 2 ? "1fr auto 1fr" : "1fr", gap: u(1.6) }}>
            {seats.map((seat, i) => {
              const p = view.seats[seat];
              const active = turn?.seat === seat;
              const result = latestResult(tryons?.jobs, seat);
              const lost = winner !== null && winner !== seat;
              return (
                <section key={seat} className={`glass flex min-h-0 flex-col transition-[filter,opacity] duration-500 ${lost ? "opacity-70 saturate-50" : ""}`}
                  style={{ order: i === 0 ? 0 : 2, padding: u(1.1), gap: u(0.9), borderRadius: u(1.4),
                    boxShadow: active || winner === seat ? `inset 0 0 0 ${u(0.15)}px ${seatVar(seat)}, 0 ${u(1.5)}px ${u(4)}px -${u(1.5)}px ${seatVar(seat)}` : undefined }}>
                  <div className={`flex items-center ${seat === 1 ? "flex-row-reverse text-right" : ""}`} style={{ gap: u(0.8) }}>
                    <Avatar name={p?.name ?? "?"} seat={seat} size={u(3.2)} active={active} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-display font-semibold" style={{ fontSize: u(1.9) }}>{p?.name ?? "…"}</p>
                      <p className="font-semibold" style={{ fontSize: u(0.95), color: active || winner === seat ? seatVar(seat) : "var(--color-mute)" }}>
                        {winner === seat ? "Winner" : active ? "On the clock" : view.status === "complete" && view.votes.tally ? `${view.votes.tally[seat]} ${view.votes.tally[seat] === 1 ? "vote" : "votes"}` : " "}
                      </p>
                    </div>
                    <p className="font-display num font-semibold" style={{ fontSize: u(1.7) }}>{fmt(view.spent[seat])}</p>
                  </div>
                  {view.config.budgetCents && (
                    <div className="overflow-hidden rounded-full bg-mist" style={{ height: u(0.45) }}>
                      <div className={`h-full rounded-full ${seat === 1 ? "ml-auto" : ""}`} style={{ width: `${Math.min(100, (view.spent[seat] / view.config.budgetCents) * 100)}%`, background: seatVar(seat) }} />
                    </div>
                  )}
                  <div className="flex min-h-0 flex-1" style={{ gap: u(0.8) }}>
                    {result && (
                      <div className="relative h-full shrink-0 overflow-hidden bg-white" style={{ aspectRatio: "3 / 4", borderRadius: u(0.9) }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={`/api/tryon/jobs/${result.id}/image`} alt="" className="h-full w-full object-cover" />
                        <span className="absolute rounded-md bg-white/90 font-semibold" style={{ left: u(0.5), bottom: u(0.5), fontSize: u(0.75), padding: `0 ${u(0.4)}px` }}>AI visualization</span>
                      </div>
                    )}
                    <div className="grid min-h-0 flex-1 grid-cols-2" style={{ gap: u(0.7) }}>
                      {orderedSlots(view.config.slots).map((slot) => {
                        const { turn: t, item } = slotState(view, seat, slot);
                        return (
                          <div key={slot} className={`relative min-h-0 overflow-hidden bg-white ${item && item.lockedAt > view.serverNow - 3000 ? "pop-in" : ""}`}
                            style={{ borderRadius: u(0.9), boxShadow: t?.status === "active" ? `inset 0 0 0 ${u(0.15)}px ${seatVar(seat)}` : "var(--shadow-soft)" }}>
                            {item ? <ProductImage product={item} eager refreshUrl={`/api/battles/${view.id}/items/${item.outfitItemId}/refresh-image`} /> : (
                              <p className="flex h-full flex-col items-center justify-center bg-mist/70 text-center text-mute" style={{ fontSize: u(0.9) }}>
                                <span className="font-semibold text-ink">{slotShort(slot)}</span>{emptyLabel(t?.status)}
                              </p>
                            )}
                            {item && <span className="absolute rounded-md bg-white/90 font-display num font-semibold" style={{ left: u(0.45), bottom: u(0.45), fontSize: u(0.95), padding: `${u(0.1)}px ${u(0.4)}px` }}>{fmt(item.priceCents)}</span>}
                            {item && <span className="absolute rounded-md bg-white/90 font-semibold" style={{ left: u(0.45), top: u(0.45), fontSize: u(0.72), padding: `0 ${u(0.4)}px` }}>{item.brand ?? slotLabel(slot)}</span>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </section>
              );
            })}
            {seats.length === 2 && (
              <div className="flex flex-col items-center justify-center" style={{ order: 1, gap: u(0.8), minWidth: u(11) }}>
                {turn ? (
                  <>
                    <TimerRing deadline={turn.deadline} total={view.config.timerSeconds} offset={offset} onExpire={refresh} size={u(10)} />
                    <p className="font-display font-semibold" style={{ fontSize: u(1.3) }}>{slotLabel(turn.slot)}</p>
                  </>
                ) : (
                  <div className="night grid place-items-center rounded-full" style={{ width: u(7), height: u(7) }}>
                    <span className="font-display font-bold" style={{ fontSize: u(2), background: "linear-gradient(135deg, var(--brand-p1), var(--brand-p2))", WebkitBackgroundClip: "text", color: "transparent" }}>VS</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {view.status === "voting" && (
            <div className="glass flex items-center" style={{ gap: u(1.2), padding: `${u(0.7)}px ${u(1.2)}px`, borderRadius: u(1) }}>
              <p className="font-semibold" style={{ fontSize: u(1.05) }}>Vote at {typeof window !== "undefined" ? location.host : ""}/battle/{view.id}</p>
              <div className="flex-1 overflow-hidden rounded-full bg-mist" style={{ height: u(0.5) }}>
                <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${(view.votes.count / view.votes.target) * 100}%`, background: "linear-gradient(90deg, var(--brand-p1), var(--brand-p2))" }} />
              </div>
            </div>
          )}
          {view.status === "complete" && !solo && (
            <div className="night flex items-center rounded-2xl" style={{ gap: u(1.2), padding: `${u(0.9)}px ${u(1.4)}px` }}>
              <p className="font-display font-bold" style={{ fontSize: u(2.2) }}>{winner === null ? "It's a draw" : `${view.seats[winner]?.name} wins`}</p>
              {view.votes.tally && <p className="num text-white/70" style={{ fontSize: u(1.2) }}>{view.votes.tally[0]} – {view.votes.tally[1]}</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
