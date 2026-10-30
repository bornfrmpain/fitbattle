"use client";
export function SignOutButton() {
  return <button className="text-sm text-mute hover:text-ink" onClick={async () => { await fetch("/api/auth/signout", { method: "POST" }); location.href = "/"; }}>Sign out</button>;
}
