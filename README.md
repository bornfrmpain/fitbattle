# Fitduel

1v1 outfit battles built from real Grailed listings, designed to be played on stream.
Players set a budget, a turn timer and categories, take turns locking in pieces, try the
fit on with AI, and viewers vote on the two outfits.

Screenshots of every screen are in `docs/screenshots/`. Try-on images there come from the
contract-test stub and say "TEST STUB OUTPUT"; they are not AI results.

## Run it

Requires **Node.js 22.5 or newer** (uses the built-in `node:sqlite` driver).

```bash
npm install
cp .env.example .env.local     # optional
npm run dev                    # http://localhost:3000
# or for production:
npm run build && npm start
```

No database server is needed; a SQLite file is created in `./data`.

## Tests

```bash
npm test                                      # unit tests: rules, timers, voting
npm run build && npm start                    # in one terminal
BASE_URL=http://localhost:3000 GRAILED_FEED_FILE=tests/fixtures/smoke-feed.json npm start   # smoke test needs a verified (test) feed
npm run smoke  # 44 end-to-end API checks, another terminal
npm run build && npm run test:tryon-contract  # 40 try-on pipeline checks against a fal.ai stub
npm run test:e2e                              # all browser suites: 63 listing/photo + 45 two-player battle + 77 wheel checks
```

`test:e2e` starts its own servers. The listing/photo suite (63 checks) also runs a second app instance **without any source** to check the empty state in every category, the exact Dior URL pasted with a real Ctrl+V, and hand-entry into the right category. It starts `scripts/partner-stub.mjs` as a stand-in **authorized source** with eight fixture listings
(thumbnail-first, avatar-first, banner-first, no sizes given, …) and needs the app running with
`GRAILED_LISTING_LOOKUP_URL=https://localhost:4444/listings/{id} IMAGE_FETCH_ALLOW_PRIVATE=1 NODE_TLS_REJECT_UNAUTHORIZED=0`
(test-only settings). It pastes each link in a real browser and checks the preview shows the right main photo,
that it stays after lock-in and after a page reload in the reveal, that each garment has its own photo, and
that it falls back, refreshes and errors correctly.

The smoke test signs up four accounts and plays a full battle over HTTP, including
a real 10-second deadline expiring.

## What works, what's mocked, what needs a service

| Area | Status |
| --- | --- |
| Battle setup: format, timer (none/15/30/60/120 s/custom), budget, categories, shuffle, turn order, theme, vote target | Working |
| Server-authoritative turn timer; refresh/device switch can't add time; late picks rejected | Working, tested |
| Budget, category, duplicate-listing and duplicate-submission rules, enforced server-side | Working, tested |
| Accounts (scrypt passwords, httpOnly session cookie), history, stats, public profiles, leaderboard | Working |
| Private battles with invite code/link (24 h expiry), random matchmaking, same-device mode, solo practice | Working |
| Multiplayer sync | Working via 1 s polling. Swap for WebSockets/managed realtime at scale |
| Reveal, item inspector, voting (no player votes, one per account), host close | Working, tested |
| Paste a Grailed listing URL | With an authorized source: details, verified price and all photos import automatically, best photo chosen (tested against a partner stub). Without one: a clear explanation, nothing can be added |
| Verified prices only | Battles accept only listings from the authorized source, at the source's price. Hand-entered pieces and prices are refused by the server (`verified_only`) and there is no manual entry UI |
| Live Grailed search and real listing photos | **Need an authorized source.** Grailed offers no public API and its terms forbid automated reads, so no real listing has been imported |
| Placeholder products | **None.** There is no demo catalog. Without an authorized source the grid shows an empty state and players paste listing links |
| Categories | Exactly four: Tops (incl. jackets, coats), Bottoms, Shoes, Miscellaneous (bags, jewellery, hats, belts, eyewear). A piece's category comes from the item, never from the current round |
| AI try-on (FASHN + Nano Banana via fal.ai) | Full flow built and contract-tested against a stub. **Never run against the real fal.ai API** (blocked in the build environment). Without `FAL_KEY` it shows a clear setup message |
| Streamer branding, stream view (`/battle/<id>/stage`), share-card export | Working |
| Database | SQLite. All SQL lives in `src/lib/db.ts` and `*/repo.ts`, so Postgres means rewriting those files |

## Grailed data and listing photos

**Why the app never reads grailed.com.** Grailed's Terms of Service (effective 27 Jan 2026, section 12)
prohibit using scrapers, crawlers or "other automated means to access, index, collect, harvest, or extract
data or content" from Grailed, and developing third-party tools that interact with Grailed without written
consent. Fetching a pasted listing page to read its photos (even only its preview image) falls under that,
so this app doesn't do it. Listing details and photos come **only from an authorized source** you
configure. Without one, pasted listings get no photo and say so.

**Authorized sources** (any combination):

| Variable | What it is |
| --- | --- |
| `GRAILED_LISTING_LOOKUP_URL` | Per-listing endpoint, `{id}` = Grailed listing id, returns one record. Used when a player pastes a link |
| `GRAILED_FEED_URL` / `GRAILED_FEED_FILE` | Bulk feed (JSON array of records). Powers search and also answers pasted links |
| `GRAILED_FEED_TOKEN` | Sent as `Authorization: Bearer …` to both |

Record format:
```json
{ "title": "Geobasket high-tops", "designer": "Rick Owens", "price_eur": 450,
  "subcategory": "sneakers", "size": "43", "condition": "gently_used", "color": "black",
  "listing_url": "https://www.grailed.com/listings/12345678-…", "seller": "…", "sold": false,
  "images": [
    { "url": "https://…/1.jpg", "width": 1200, "height": 1600 },
    { "url": "https://…/2.jpg" },
    { "url": "https://…/avatar.jpg", "kind": "avatar" }
  ] }
```
`images` may also be plain URL strings; the older single `image_url` still works. `subcategory` is a key in
`src/lib/categories.ts` (or give `slot`). The product id is `feed:<listing id>`, so a pasted link and a search
result for the same listing are the same product.

**Choosing the main photo** (`src/lib/products/imageSelect.ts`). Only the listing's own photos are considered;
nothing is ever searched for by title. The selector:
- drops photos marked or named as avatar, profile, logo, icon, badge or placeholder
- drops banner shapes (wider than 2:1 or taller than 1:2.5)
- drops thumbnails under 400 px on the short side when a larger photo exists
- scores the rest on resolution, portrait/square shape and position (the seller's cover photo gets a strong bonus)

When the source gives no sizes, the server reads only the first 128 KB of each photo to get its dimensions and
caches the numbers, never the image. It can't see picture content, so a sharp detail shot uploaded as the cover
can still win. The choice and the reason are shown in the preview and the item inspector.

**One product record everywhere.** At lock-in the server stores a snapshot with `imageUrl` (main photo),
`images[]` (all usable photos, main first) and how it was chosen. If the main photo differs from the preview, the
photo the player saw is kept, but only if it belongs to the listing. The same snapshot drives the outfit
slots, reveal, stream view, share card, battle history and try-on, and survives reloads.

**When a photo stops loading.** The image component tries the listing's next stored photo, then asks the server
for an authorized refresh (`POST /api/battles/:id/items/:itemId/refresh-image`). That re-reads the same listing
from the source and saves its current photo URLs. If nothing works, it shows "Photo couldn't load". Real listings
never get an illustration or a substitute image.

**Image storage.** Photos are displayed straight from the source's URLs. The server downloads them only
transiently, for try-on input and the share-card canvas, and doesn't write them to disk. Check your source's terms
before adding any image caching.

**Without an authorized source**, a pasted link is checked for format and the player is told plainly that the
listing can't be retrieved and therefore can't enter a battle. There is no manual price entry: unverified prices never
enter a competitive battle. Battles saved by older versions may still contain hand-entered pieces; they display as
"Unverified (legacy)".

## Pasting a listing link

Two separate steps with separate messages (`src/lib/products/manual.ts`, `resolve.ts`):

1. **Format** (no network). Parsed with `URL`. The link must be `grailed.com` or `www.grailed.com`, path `/listings/<number>[-any slug]`.
   Whitespace, query strings, fragments, trailing slashes and percent-encoded slugs are fine; the link is normalized to
   `https://www.grailed.com/listings/<id>-<slug>`. Rejected with specific messages: two links pasted together, other sites,
   search, designer and profile pages, listing sub-pages, links without a listing number.
2. **Retrieval** (authorized source only). Outcomes: found (details and photos import), *no authorized source connected*,
   *listing unavailable from the source*, or *retrieval failed*. A valid link never implies the listing could be fetched.

Categories of imported listings come from their subcategory, or from the last garment noun in the title or slug
(`classifyText` in `src/lib/categories.ts`), so a hoodie is always Tops.

## Rules worth knowing

- The timer is per pick. Each turn stores `startedAt` and `deadline`; when a deadline
  passes, the next turn starts **at that deadline**, so being offline never gains time.
  Deadlines are judged at the moment the request reached the server.
- Budgets count listed prices only (no shipping, tax, fees). Prices always come from the
  server-side source, never the client.
- A listing can only be in one outfit per battle.
- Sold-after-selection: the outfit keeps the snapshot; the owner can mark it sold.
- Themes: "Best fit on a budget" and "Designer only" are enforced. The others are guidance,
  because listing data can't prove a piece is "archive".
- Players can't vote in their own battle. Voting closes at the target vote count, or when
  the host closes it after at least one vote. Ties are draws.

## Battles

- Rounds always run **Tops → Bottoms → Shoes → Miscellaneous** (enforced on the server; the client can't reorder them).
- One pick per player per round, or "Leave … empty". A pick is final; stale, duplicate, late and out-of-turn submissions are rejected.
- The turn deadline is stored on the server; refreshing, reconnecting or switching devices never resets it.
- Totals and the budget (default €500) use the source's verified prices only.
- The category tabs in the battle open both players' picks for that category.
- **Challenges**: players can attach announced conditions (e.g. a Wheel result such as "Pick a Brand: Rick Owens"). They're shown
  on the battle screen, reveal and stream view, and change no rule. Max 10 per battle, players only.

## Wheel / Randomizer (`/wheel`)

- Price, Brand and Custom modes with optional presets; 2–100 entries, up to 60 characters each; any text, emoji and currency symbols.
  Duplicates are separate segments. Every segment has an equal chance (no weighting).
- The winner is drawn with `crypto.getRandomValues` (rejection sampling, no modulo bias) **before** the animation, which then stops
  inside that segment (`lib/wheel/model.ts`). Unit tests check every wheel size 2–100 and every index; the browser test reads the
  segment physically under the pointer after each spin.
- Editor: add, edit, delete, reorder, paste a list, title, new, duplicate, clear. Unsaved changes are protected (mode switch, load, leaving the page).
- Saving: signed in → your account (`/api/wheels`, validated server-side, owner-only). Guest → this device only (localStorage), labeled as such.
- Share links (`/wheel?w=…`) carry only the validated configuration. Stream view: `/wheel/stage?w=…` (Space spins).
- "Use in FIT/DUEL": add the result as a battle challenge, start a battle with a euro result as budget, or with the result as theme.
  None of these bypass battle validation.
- Sound is off by default (toggle remembered per device).

## Design

Light pearl/lavender surfaces, near-black type, violet (player 1) and cobalt (player 2) accents, dark surfaces only
for the timer, primary actions and the winner moment. Type: Unbounded (headlines, timer) and Geist (UI). Tokens live in
`src/app/globals.css`; shared parts (avatar, budget bar, timer ring, category tracker, notices, empty states) in
`src/components/ui.tsx`. Player colours can be overridden per streamer with `BRAND_P1` / `BRAND_P2`.

## Streaming

- Set the `STREAMER_*` and `BRAND_*` variables (see `.env.example`). Colours apply before first paint.
- Add the stream view as an OBS **Browser Source**: `https://<your-site>/battle/<id>/stage`, 1920×1080.
  It's 16:9, has no site chrome, and follows the timer, picks, votes and winner live. Log the OBS
  browser in as the streamer if you want private try-on results on screen; otherwise only results
  marked "Everyone viewing this battle" appear.
- "Save result image" on the reveal downloads a 1600×900 PNG for socials.

## AI try-on

**Flow:** finish the outfit → "Try On My Fit" → upload photo → confirm which pieces → generate (per-step
progress) → result next to the original photo and product links → save, retry, generate another, or delete.

**Models (fal.ai, one account, `FAL_KEY`):**

| Category | Model | Price (fal.ai listing) | Notes |
| --- | --- | --- | --- |
| Tops, bottoms, outerwear | FASHN v1.6 `fal-ai/fashn/tryon/v1.6` | ~$0.075 per garment | Dedicated try-on model. One garment per call; chained bottoms → top → outerwear |
| Shoes, accessories, bags | Nano Banana edit `fal-ai/nano-banana/edit` | ~$0.039 per image | General multi-image editor. Lower fidelity; one pass with all extras. Disable with `TRYON_EXTRAS=off` |
| Items without a product photo | none | | Listed as "can't be shown" with the reason |

A full outfit costs roughly $0.26. Product photos are downloaded **server-side from the locked-in listing
snapshot** (https only, public hosts only, 10 MB cap) and sent as data URIs, so the model gets exactly the
selected garments. Jobs run in the Node process: use `next start` on a long-running server, not a
serverless host with short timeouts.

**Not verified:** real output quality, real latency, and whether Nano Banana accepts data-URI inputs
(fal docs show URLs; FASHN explicitly accepts base64). If it rejects them, upload garments to fal storage
first in `src/lib/tryon/provider.ts`.

**Testing it for real:** set `FAL_KEY`, start the app, play a battle using Grailed listing links that
include an image URL, then press "Try On My Fit".

## Privacy (try-on)

Photos are stored in `DATA_DIR/private`, outside the public web root. The original photo is only
ever served to the person who uploaded it. Results are private by default; the uploader can share
them with their opponent or with everyone viewing the battle (including the stream view). Users
confirm consent before upload (their own photo, or the pictured person's permission) and can delete
the photo and every result made from it. The photo and product images are sent to fal.ai to
generate the image. No automatic retention limit is implemented yet; add a cleanup job if you need one.

## Layout

```
src/lib/battle/rules.ts      pure rules engine (timers, turns, budget, votes)
src/lib/battle/repo.ts       persistence + transactional mutations
src/lib/products/            authorized feed/lookup, URL validation, manual entry, photo selection
src/lib/tryon/               FASHN client, private photo storage
src/app/api/                 route handlers
src/components/              PieceFinder (import + search), ui primitives, battle screen, reveal, stream view, try-on, wheel/
src/lib/wheel/                wheel model (validation, randomness, geometry, share links), storage
tests/                       Vitest unit tests
scripts/smoke.mjs            end-to-end API checks
```
