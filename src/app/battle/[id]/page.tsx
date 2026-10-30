import { notFound } from "next/navigation";
import { BattleClient } from "@/components/battle/BattleClient";
import { currentUser } from "@/lib/auth";
import { publicView, readBattle } from "@/lib/battle/repo";
import { getBrand } from "@/lib/brand";

export const dynamic = "force-dynamic";
export const metadata = { title: "Battle" };

export default async function BattlePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const battle = readBattle(id);
  if (!battle) notFound();
  const user = await currentUser();
  return <BattleClient initial={publicView(battle, user?.id ?? null)} brand={getBrand()} />;
}
