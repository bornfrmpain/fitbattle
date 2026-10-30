import { PieceFinder } from "@/components/PieceFinder";
import { toSlot } from "@/lib/categories";

export const metadata = { title: "Browse clothing" };
export default async function Browse({ searchParams }: { searchParams: Promise<{ slot?: string }> }) {
  const { slot } = await searchParams;
  return (
    <div className="mx-auto max-w-[1440px] px-4 py-10 md:px-8 md:py-14">
      <p className="eyebrow">Verified listings only</p>
      <h1 className="display mt-2 text-4xl md:text-6xl">Browse clothing</h1>
      <p className="mt-3 mb-8 max-w-prose text-mute">Paste a Grailed listing link to preview it with its real price and photos, or search the connected source. There are no placeholder products.</p>
      <PieceFinder initialSlot={toSlot(slot) ?? undefined} />
    </div>
  );
}
