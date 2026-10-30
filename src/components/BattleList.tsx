import Link from "next/link";
import type { BattleState } from "@/lib/battle/types";
import { fmt, spentCents } from "@/lib/battle/rules";
import { ProductImage } from "./ProductCard";

const STATUS: Record<string, string> = { waiting: "Waiting for opponent", active: "In progress", voting: "Voting open", complete: "Finished" };

export function BattleList({ battles, userId }: { battles: BattleState[]; userId?: string }) {
  if (!battles.length) return <p className="text-mute">No battles yet.</p>;
  return (
    <ul className="flex flex-col gap-3">
      {battles.map((b) => {
        const mySeat = userId ? (b.seats[0].userId === userId ? 0 : b.seats[1]?.userId === userId ? 1 : null) : null;
        const result = b.status === "complete" && b.config.mode !== "solo"
          ? b.winner === "draw" ? "Draw" : mySeat === null || b.config.mode === "local" ? `${b.seats[b.winner as 0 | 1]?.name} won` : b.winner === mySeat ? "Won" : "Lost"
          : STATUS[b.status];
        const seat = (mySeat ?? 0) as 0 | 1;
        const items = b.items.filter((i) => i.seat === seat);
        return (
          <li key={b.id}>
            <Link href={`/battle/${b.id}`} className="glass lift flex flex-col gap-4 p-4 md:flex-row md:items-center">
              <div className="md:w-64 shrink-0">
                <p className="font-semibold">{b.seats[0].name} <span className="text-mute">vs</span> {b.seats[1]?.name ?? "…"}</p>
                <p className="text-sm text-mute">{new Date(b.createdAt).toLocaleDateString()} · {b.config.mode === "local" ? "same device" : b.config.mode === "solo" ? "solo" : "online"}</p>
              </div>
              <div className="flex flex-1 gap-2 overflow-hidden">
                {items.map((i) => <div key={i.outfitItemId} className="h-16 w-13 shrink-0 overflow-hidden rounded-lg bg-white" style={{ width: "3.25rem" }}><ProductImage product={i} compact refreshUrl={`/api/battles/${b.id}/items/${i.outfitItemId}/refresh-image`} /></div>)}
                {!items.length && <span className="self-center text-sm text-mute">No pieces yet</span>}
              </div>
              <div className="md:text-right">
                <p className="text-sm font-semibold">{result}</p>
                <p className="num text-sm text-mute">{fmt(spentCents(b, seat))}</p>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
