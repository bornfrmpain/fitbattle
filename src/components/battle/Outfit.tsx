"use client";
import { useEffect, useRef, useState } from "react";
import type { BattleView } from "@/lib/battle/repo";
import type { OutfitItem } from "@/lib/battle/types";
import { fmt } from "@/lib/battle/rules";
import { CONDITION_LABEL, SLOTS, slotLabel, slotShort, type Slot } from "@/lib/categories";
import { PriceTag, ProductImage, SourceBadge } from "../ProductCard";
import { Avatar } from "../ui";
import Link from "next/link";

export function StreamLink({ id }: { id: string }) {
  return <Link href={`/battle/${id}/stage`} target="_blank" className="btn btn-quiet w-full text-sm">Open stream view ↗</Link>;
}

export function slotState(view: BattleView, seat: 0 | 1, slot: string) {
  const turn = view.turns.find((t) => t.seat === seat && t.slot === slot);
  const item = view.items.find((i) => i.seat === seat && i.slot === slot && i.turnIndex === turn?.index) ?? null;
  return { turn, item };
}
export const emptyLabel = (status?: string) =>
  status === "expired" ? "Time ran out" : status === "skipped" ? "Left empty" : status === "active" ? "Choosing" : "Up next";
export const orderedSlots = (slots: string[]) => [...slots].sort((a, b) => SLOTS.indexOf(a as Slot) - SLOTS.indexOf(b as Slot));
const refreshUrl = (view: BattleView, item: OutfitItem) => `/api/battles/${view.id}/items/${item.outfitItemId}/refresh-image`;

/** Compact side panel: both outfits as four small tiles each. */
export function OutfitPanel({ view }: { view: BattleView }) {
  const seats: (0 | 1)[] = view.config.mode === "solo" ? [0] : [0, 1];
  return (
    <aside aria-label="Outfit progress" className="flex flex-col gap-4 lg:self-start">
      {seats.map((seat) => {
        const p = view.seats[seat];
        if (!p) return null;
        return (
          <section key={seat} className="glass p-4" aria-label={`${p.name}'s outfit`}>
            <div className="mb-3 flex items-center gap-2.5">
              <Avatar name={p.name} seat={seat} size={28} />
              <p className="min-w-0 flex-1 truncate font-semibold">{p.name}</p>
              <p className="num text-sm text-mute">{fmt(view.spent[seat])}</p>
            </div>
            <ul className="grid grid-cols-4 gap-2">
              {orderedSlots(view.config.slots).map((slot) => {
                const { turn, item } = slotState(view, seat, slot);
                const now = turn?.status === "active";
                return (
                  <li key={slot} className="min-w-0">
                    <div className={`aspect-[4/5] overflow-hidden rounded-xl bg-mist ${item && item.lockedAt > view.serverNow - 3000 ? "pop-in" : ""}`}
                      style={now ? { boxShadow: `inset 0 0 0 2px ${seat === 0 ? "var(--brand-p1)" : "var(--brand-p2)"}` } : undefined}>
                      {item ? <ProductImage product={item} compact refreshUrl={refreshUrl(view, item)} /> : (
                        <span className="flex h-full items-center justify-center p-1 text-center text-[10px] font-medium leading-tight text-mute">{emptyLabel(turn?.status)}</span>
                      )}
                    </div>
                    <p className="mt-1 truncate text-[11px] font-medium text-mute">{slotShort(slot)}</p>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
      <StreamLink id={view.id} />
    </aside>
  );
}

export function InspectDialog({ item, onClose, canFlag, onFlag, battleId }: { item: OutfitItem | null; onClose: () => void; canFlag?: boolean; onFlag?: () => void; battleId?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [shown, setShown] = useState(0);
  useEffect(() => setShown(0), [item?.outfitItemId]);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (item && !d.open) d.showModal();
    if (!item && d.open) d.close();
  }, [item]);
  return (
    <dialog ref={ref} onClose={onClose} onClick={(e) => e.target === ref.current && onClose()}
      className="m-auto w-[min(920px,94vw)] max-h-[92dvh] overflow-hidden rounded-3xl bg-white p-0 text-ink shadow-[var(--shadow-lift)] backdrop:bg-night/50 backdrop:backdrop-blur-md">
      {item && (
        <div className="grid md:grid-cols-[1.05fr_1fr]">
          <div className="flex flex-col bg-pearl">
            <div className="relative aspect-[4/5]">
              <ProductImage product={shown ? { ...item, images: [item.images[shown], ...item.images.filter((_, i) => i !== shown)] } : item}
                refreshUrl={battleId ? `/api/battles/${battleId}/items/${item.outfitItemId}/refresh-image` : undefined} />
            </div>
            {item.images.length > 1 && (
              <div className="flex gap-2 overflow-x-auto p-3" aria-label="Listing photos">
                {item.images.map((u, i) => (
                  <button key={u} onClick={() => setShown(i)} aria-label={`Photo ${i + 1}`} aria-pressed={shown === i}
                    className={`h-16 w-14 shrink-0 overflow-hidden rounded-lg bg-white transition ${shown === i ? "shadow-[inset_0_0_0_2px_var(--brand-p1)]" : "opacity-60 hover:opacity-100"}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={u} alt="" referrerPolicy="no-referrer" className="h-full w-full object-contain" />
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="flex flex-col gap-3 p-6 md:p-8">
            <div className="flex items-center gap-2"><SourceBadge source={item.source} /><span className="eyebrow">{slotLabel(item.slot)}</span></div>
            <h3 className="display text-3xl">{item.brand ?? "No designer listed"}</h3>
            <p className="text-lg text-mute">{item.title}</p>
            <div><PriceTag cents={item.priceCents} className="!text-2xl" label="locked price" /></div>
            <dl className="mt-1 grid grid-cols-[6.5rem_1fr] gap-y-1.5 text-sm">
              {item.size && <><dt className="text-mute">Size</dt><dd>{item.size}</dd></>}
              {item.condition && <><dt className="text-mute">Condition</dt><dd>{CONDITION_LABEL[item.condition]}</dd></>}
              {item.color && <><dt className="text-mute">Colour</dt><dd>{item.color}</dd></>}
              {item.seller && <><dt className="text-mute">Seller</dt><dd>{item.seller}</dd></>}
              <dt className="text-mute">Locked in</dt><dd>{new Date(item.lockedAt).toLocaleString()}</dd>
            </dl>
            {item.imageSelection && item.source === "feed" && <p className="text-xs text-mute">{item.imageSelection.note}</p>}
            {item.soldSinceSelection && <p className="rounded-xl bg-mist p-3 text-sm">Reported sold after it was picked. The battle keeps the price it had.</p>}
            <div className="mt-auto flex flex-wrap gap-2 pt-4">
              {item.listingUrl && <a className="btn btn-dark" href={item.listingUrl} target="_blank" rel="noopener noreferrer">View on Grailed ↗</a>}
              {canFlag && !item.soldSinceSelection && item.listingUrl && <button className="btn btn-quiet" onClick={onFlag}>Report sold</button>}
              <button className="btn btn-quiet" onClick={onClose} autoFocus>Close</button>
            </div>
          </div>
        </div>
      )}
    </dialog>
  );
}
