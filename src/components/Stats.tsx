export function Stats({ s }: { s: { wins: number; losses: number; draws: number; played: number; winRate: number | null } }) {
  const cells: [string, string][] = [["Wins", String(s.wins)], ["Losses", String(s.losses)], ["Draws", String(s.draws)], ["Win rate", s.winRate === null ? "–" : `${Math.round(s.winRate * 100)}%`]];
  return (
    <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {cells.map(([k, v]) => <div key={k} className="glass p-5"><dt className="eyebrow">{k}</dt><dd className="mt-3 font-display text-4xl font-semibold num">{v}</dd></div>)}
    </dl>
  );
}
