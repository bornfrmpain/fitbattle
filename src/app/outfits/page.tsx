import Link from "next/link";
import { BattleList } from "@/components/BattleList";
import { currentUser } from "@/lib/auth";
import { battlesForUser } from "@/lib/battle/repo";

export const dynamic = "force-dynamic";
export const metadata = { title: "My outfits" };
export default async function Outfits() {
  const user = await currentUser();
  return (
    <div className="mx-auto max-w-[1200px] px-4 md:px-8 py-10 md:py-16">
      <h1 className="display text-4xl md:text-6xl mb-8">My outfits</h1>
      {user ? <BattleList battles={battlesForUser(user.id)} userId={user.id} /> : (
        <p className="text-mute"><Link className="link text-ink" href="/signin?next=/outfits">Sign in</Link> to see the outfits you&rsquo;ve built and your battle history.</p>
      )}
    </div>
  );
}
