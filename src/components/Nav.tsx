import Link from "next/link";
import type { User } from "@/lib/auth";
import type { Brand } from "@/lib/brand";
import { SignOutButton } from "./SignOutButton";

const LINKS = [
  { href: "/play", label: "Play" },
  { href: "/browse", label: "Browse Clothing" },
  { href: "/how-it-works", label: "How It Works" },
  { href: "/outfits", label: "My Outfits" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/wheel", label: "Wheel" },
];

export function Wordmark({ brand, size = "md" }: { brand: Brand; size?: "md" | "lg" }) {
  const [a, b] = brand.appName.includes("/") ? brand.appName.split("/") : [brand.appName, ""];
  return (
    <span className="inline-flex items-center gap-2.5">
      {brand.logoUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={brand.logoUrl} alt="" className={`${size === "lg" ? "h-12 w-12" : "h-7 w-7"} rounded-full object-cover`} />
      )}
      <span className={`font-display font-bold tracking-tight ${size === "lg" ? "text-4xl" : "text-[1.05rem]"}`}>
        {a}{b && <><span className="text-accent">/</span>{b}</>}
      </span>
      {brand.streamerName && <span className="hidden sm:inline text-xs font-semibold text-mute">× {brand.streamerName}</span>}
    </span>
  );
}

export function Nav({ user, brand }: { user: User | null; brand: Brand }) {
  return (
    <header className="sticky top-0 z-40 pt-[env(safe-area-inset-top)]">
      <div className="glass !rounded-none !shadow-[inset_0_-1px_0_#0e0d1610]">
        <div className="mx-auto flex h-14 max-w-[1440px] items-center gap-6 px-4 md:px-8">
          <Link href="/" aria-label={`${brand.appName} home`}><Wordmark brand={brand} /></Link>
          <nav aria-label="Main" className="hidden lg:flex items-center gap-1 text-sm font-medium text-mute">
            {LINKS.map((l) => <Link key={l.href} href={l.href} className="rounded-lg px-3 py-2 hover:bg-white/70 hover:text-ink transition-colors">{l.label}</Link>)}
          </nav>
          <div className="ml-auto flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-3 text-sm text-mute">
              {user ? (<><Link href="/profile" className="hover:text-ink">{user.displayName}</Link><SignOutButton /></>)
                : <Link href="/signin" className="hover:text-ink">Sign in</Link>}
            </div>
            <Link href="/play" className="btn btn-dark !min-h-9 !px-4 text-sm"><span className="sm:hidden">Play</span><span className="hidden sm:inline">Start a battle</span></Link>
            <details className="lg:hidden relative">
              <summary className="list-none cursor-pointer btn btn-quiet !min-h-9 !px-3 text-sm" aria-label="Open menu">Menu</summary>
              <nav aria-label="Mobile" className="absolute right-0 mt-2 w-60 card p-2">
                {LINKS.map((l) => <Link key={l.href} href={l.href} className="block rounded-xl px-3 py-3 font-medium hover:bg-mist">{l.label}</Link>)}
                <Link href={user ? "/profile" : "/signin"} className="block rounded-xl px-3 py-3 font-medium hover:bg-mist">{user ? "Profile" : "Sign in"}</Link>
                {user && <div className="px-3 py-3"><SignOutButton /></div>}
              </nav>
            </details>
          </div>
        </div>
      </div>
    </header>
  );
}
