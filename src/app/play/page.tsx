import Link from "next/link";
import { currentUser } from "@/lib/auth";
import { SetupForm, type SetupPrefill } from "./SetupForm";

export const metadata = { title: "Start a battle" };

// Optional prefill from a Wheel result (?budget=120 or ?theme=custom&customTheme=…).
// Only fills the form; the server validates the config when the battle is created.
function prefillFrom(sp: Record<string, string | undefined>): SetupPrefill | undefined {
  const budget = Number(sp.budget);
  if (sp.budget && Number.isFinite(budget) && budget >= 1 && budget <= 100000)
    return { budgetEur: Math.round(budget * 100) / 100, note: `budget set to €${budget}. Change anything before you start.` };
  const t = (sp.customTheme ?? "").trim().slice(0, 80);
  if (sp.theme === "custom" && t) return { theme: "custom", customTheme: t, note: `theme set to “${t}”. Change anything before you start.` };
  return undefined;
}

export default async function Play({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const [user, sp] = [await currentUser(), await searchParams];
  return (
    <div className="mx-auto max-w-5xl px-4 md:px-8 py-10 md:py-16">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-10">
        <div><p className="eyebrow">New battle</p><h1 className="display mt-2 text-4xl md:text-6xl">Set the rules</h1></div>
        <Link href="/join" className="text-sm text-mute link hover:text-ink">Have an invite code?</Link>
      </div>
      <SetupForm signedIn={!!user} prefill={prefillFrom(sp)} />
    </div>
  );
}
