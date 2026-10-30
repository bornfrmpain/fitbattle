import { currentUser } from "@/lib/auth";
import { JoinForm } from "./JoinForm";
export const metadata = { title: "Join a battle" };
export default async function Join({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const { code } = await searchParams;
  const user = await currentUser();
  return (
    <div className="mx-auto max-w-xl px-4 py-16 md:py-24">
      <h1 className="display text-4xl md:text-6xl">Join a battle</h1>
      <p className="mt-4 text-mute">Enter the six-character code your opponent sent you.</p>
      <JoinForm initialCode={code ?? ""} signedIn={!!user} />
    </div>
  );
}
