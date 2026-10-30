import Link from "next/link";
import { redirect } from "next/navigation";
import { BattleList } from "@/components/BattleList";
import { Stats } from "@/components/Stats";
import { currentUser } from "@/lib/auth";
import { battlesForUser, statsForUser } from "@/lib/battle/repo";

export const dynamic = "force-dynamic";
export const metadata = { title: "Profile" };
export default async function Profile() {
  const user = await currentUser();
  if (!user) redirect("/signin?next=/profile");
  return (
    <div className="mx-auto max-w-[1200px] px-4 md:px-8 py-10 md:py-16">
      <h1 className="display text-4xl md:text-6xl">{user.displayName}</h1>
      <p className="mt-2 text-mute">@{user.username} · <Link href={`/u/${user.username}`} className="link">Public profile</Link></p>
      <p className="mt-8 mb-3 text-sm text-mute">Record from online battles. Same-device and solo games don&rsquo;t count.</p>
      <Stats s={statsForUser(user.id)} />
      <h2 className="display text-2xl md:text-3xl mt-14 mb-4">Recent battles</h2>
      <BattleList battles={battlesForUser(user.id, 10)} userId={user.id} />
    </div>
  );
}
