import { notFound } from "next/navigation";
import { BattleList } from "@/components/BattleList";
import { Stats } from "@/components/Stats";
import { battlesForUser, statsForUser } from "@/lib/battle/repo";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
export default async function PublicProfile({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const u = db().prepare("SELECT id, username, display_name FROM users WHERE username = ?").get(username) as { id: string; username: string; display_name: string } | undefined;
  if (!u) notFound();
  const finished = battlesForUser(u.id, 30).filter((b) => b.status === "complete" && b.config.mode !== "solo");
  return (
    <div className="mx-auto max-w-[1200px] px-4 md:px-8 py-10 md:py-16">
      <h1 className="display text-4xl md:text-6xl">{u.display_name}</h1>
      <p className="mt-2 mb-8 text-mute">@{u.username}</p>
      <Stats s={statsForUser(u.id)} />
      <h2 className="display text-2xl md:text-3xl mt-14 mb-4">Finished battles</h2>
      <BattleList battles={finished} userId={u.id} />
    </div>
  );
}
