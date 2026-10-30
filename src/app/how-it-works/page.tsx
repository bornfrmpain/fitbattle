import Link from "next/link";
import { liveDataConfigured } from "@/lib/products";
import { tryOnConfigured } from "@/lib/tryon/provider";

export const dynamic = "force-dynamic";
export const metadata = { title: "How it works" };

export default function HowItWorks() {
  const live = liveDataConfigured();
  const tryon = tryOnConfigured();
  return (
    <div className="mx-auto max-w-3xl px-4 md:px-8 py-10 md:py-16 [&_h2]:display [&_h2]:text-4xl [&_h2]:mt-14 [&_h2]:mb-4 [&_p]:text-mute [&_p]:mb-4 [&_p]:max-w-prose">
      <h1 className="display text-4xl md:text-6xl">How it works</h1>

      <h2>The battle</h2>
      <p>There are four categories: Tops (including jackets and coats), Bottoms, Shoes and Miscellaneous (bags, jewellery, hats, belts, eyewear). A piece goes in the category of the item itself, so a hoodie is always a top.</p>
      <p>Two players build outfits under the same rules: a budget, a set of categories, an optional turn timer and an optional theme. Each turn names one category. You find a piece, lock it in, and the turn passes on. When every category is done, both outfits are revealed side by side and judges vote.</p>
      <p>The timer runs on our server. Each turn stores a start time and a deadline, and your screen only displays the time left. Refreshing, closing the tab or switching devices doesn&rsquo;t pause or reset it. A pick that arrives after the deadline is rejected, the category is left empty, and play moves on.</p>
      <p>Budgets count the listed price of each piece at the moment you picked it, before shipping, taxes and fees. A pick that would take you over is blocked, and search can hide anything you can&rsquo;t afford.</p>

      <h2>Where the clothes come from</h2>
      <p>Grailed doesn&rsquo;t offer a public API, and we don&rsquo;t scrape the site or use its private endpoints. Every piece is labeled with its source. There are no demo or placeholder products: if nothing has been imported, the battle shows an empty state.</p>
      <ul className="mb-4 space-y-3 max-w-prose">
        <li><strong>Live listing.</strong> <span className="text-mute">From an authorized Grailed data source connected by the site operator. Paste a listing link and its details and photos import automatically; the clearest full photo becomes the main image. {live ? "A feed is connected on this server." : "No feed is connected on this server right now."}</span></li>
        <li><strong>Entered by player, not verified.</strong> <span className="text-mute">The listing wasn&rsquo;t available from an authorized source, so you typed its details. Grailed&rsquo;s terms don&rsquo;t allow apps to read listing pages, so these pieces have no photo unless you add a photo link yourself, and we can&rsquo;t confirm the price or that it&rsquo;s still for sale.</span></li>
      </ul>
      <p>If a listing sells after you pick it, it stays in your outfit as it was, and you can mark it sold so judges know. At the moment of picking, a listing the data source reports as sold is refused, and your timer keeps running while you choose another.</p>

      <h2>Voting</h2>
      <p>Anyone signed in with the link can judge, except the two players. One vote per account. Voting closes when the target number of votes is reached, or when the host closes it after at least one vote. We don&rsquo;t compute a &ldquo;style score&rdquo;: the result is what people voted.</p>

      <h2>AI try-on</h2>
      <p>Once your outfit is complete, press &ldquo;Try On My Fit&rdquo;, upload a full-body photo, check which pieces to include, and confirm. The real product photos from your listings go to fal.ai together with your photo. Tops, bottoms and outerwear go through FASHN, a dedicated try-on model, one garment at a time. Shoes, accessories and bags are added afterwards by a general image editor (Nano Banana), which follows the product photo less closely. Pieces without a product photo can&rsquo;t be shown.</p>
      <p>The result is an AI visualization: an impression, not a fitting. It can change details and says nothing about how the size fits you. Your original photo, the product photos and the generated image are stored separately. Photos are private by default; you choose whether your opponent or the whole battle (including the stream view) can see the result, and you can delete the photo and every result at any time. {tryon ? "Try-on is enabled on this server." : "Try-on isn't enabled on this server yet."}</p>

      <h2>On stream</h2>
      <p>Every battle has a stream view at <code>/battle/&lt;id&gt;/stage</code>: a 16:9 layout without site chrome for an OBS browser source. It follows the timer, picks, votes and winner live. &ldquo;Save result image&rdquo; on the reveal exports a 1600×900 card for socials.</p>

      <Link href="/play" className="btn btn-dark mt-8">Start a battle</Link>
    </div>
  );
}
