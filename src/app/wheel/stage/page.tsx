import { WheelStage } from "@/components/wheel/WheelStage";
import { getBrand } from "@/lib/brand";

export const metadata = { title: "Wheel stream view" };
export default async function WheelStagePage({ searchParams }: { searchParams: Promise<{ w?: string }> }) {
  const { w } = await searchParams;
  return <WheelStage share={w} brand={getBrand()} />;
}
