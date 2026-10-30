import Link from "next/link";
export default function NotFound() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-24">
      <h1 className="display text-5xl">Not found</h1>
      <p className="mt-4 text-mute">That battle or page doesn&rsquo;t exist. Check the link, or start a new battle.</p>
      <Link href="/play" className="btn btn-dark mt-8">Start a battle</Link>
    </div>
  );
}
