import type { Metadata, Viewport } from "next";
import "@fontsource-variable/geist/index.css";
import "@fontsource-variable/unbounded/index.css";
import "./globals.css";
import { Nav } from "@/components/Nav";
import { currentUser } from "@/lib/auth";
import { brandCss, getBrand } from "@/lib/brand";

export async function generateMetadata(): Promise<Metadata> {
  const b = getBrand();
  const name = b.streamerName ? `${b.appName} × ${b.streamerName}` : b.appName;
  return {
    title: { default: `${name}: 1v1 outfit battles with real Grailed pieces`, template: `%s · ${name}` },
    description: "Challenge a friend or chat, build an outfit from verified Grailed listings under a budget and a clock, and let viewers vote.",
  };
}
export const viewport: Viewport = { themeColor: "#F5F4F9", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [user, brand] = [await currentUser(), getBrand()];
  return (
    <html lang="en">
      <head><style dangerouslySetInnerHTML={{ __html: brandCss(brand) }} /></head>
      <body>
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 btn btn-dark">Skip to content</a>
        <Nav user={user} brand={brand} />
        <main id="main">{children}</main>
      </body>
    </html>
  );
}
