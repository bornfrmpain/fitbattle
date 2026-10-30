import { WheelStudio } from "@/components/wheel/WheelStudio";
import { currentUser } from "@/lib/auth";

export const metadata = { title: "Wheel" };
export const dynamic = "force-dynamic";

export default async function WheelPage({ searchParams }: { searchParams: Promise<{ w?: string; id?: string }> }) {
  const [user, sp] = [await currentUser(), await searchParams];
  return <WheelStudio signedIn={!!user} shareParam={sp.w} idParam={sp.id} />;
}
