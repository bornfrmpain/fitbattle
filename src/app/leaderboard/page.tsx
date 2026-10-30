import Link from "next/link";
import { leaderboard } from "@/lib/battle/repo";

export const dynamic = "force-dynamic";
export const metadata = { title: "Leaderboard" };
export default function Leaderboard() {
  const rows = leaderboard();
  return (
    <div className="mx-auto max-w-3xl px-4 md:px-8 py-10 md:py-16">
      <h1 className="display text-4xl md:text-6xl">Leaderboard</h1>
      <p className="mt-3 mb-8 text-mute">Ranked by wins in finished online battles.</p>
      {rows.length === 0 ? <p className="text-mute">No finished online battles yet. <Link href="/play" className="link text-ink">Start one</Link>.</p> : (
        <table className="w-full text-left">
          <thead className="text-sm text-mute border-b border-line"><tr><th className="py-2 w-12">Rank</th><th>Player</th><th className="text-right">Wins</th><th className="text-right">Losses</th><th className="text-right">Played</th></tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.username} className="border-b border-line">
                <td className="py-3 num text-mute">{i + 1}</td>
                <td><Link className="hover:link" href={`/u/${r.username}`}>{r.displayName}</Link></td>
                <td className="num text-right">{r.wins}</td><td className="num text-right text-mute">{r.losses}</td><td className="num text-right text-mute">{r.played}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
