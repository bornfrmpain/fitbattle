import { notFound } from "next/navigation";
import { Stage } from "@/components/battle/Stage";
import { currentUser } from "@/lib/auth";
import { publicView, readBattle } from "@/lib/battle/repo";
import { getBrand } from "@/lib/brand";

export const dynamic = "force-dynamic";
export const metadata = { title: "Stream view" };

export default async function StagePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const battle = readBattle(id);
  if (!battle) notFound();
  const user = await currentUser();
  return <Stage initial={publicView(battle, user?.id ?? null)} brand={getBrand()} />;
}
