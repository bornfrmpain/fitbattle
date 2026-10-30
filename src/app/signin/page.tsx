import { AuthForm } from "./AuthForm";
export const metadata = { title: "Sign in" };
export default async function SignIn({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "/play";
  return (
    <div className="mx-auto max-w-md px-4 py-16 md:py-24">
      <AuthForm next={safeNext} />
    </div>
  );
}
