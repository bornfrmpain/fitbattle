// End-to-end check of the core flows against a running server.
// Usage: BASE_URL=http://localhost:3000 node scripts/smoke.mjs
const BASE = process.env.BASE_URL || "http://localhost:3000";
const tag = Date.now().toString(36);
let passed = 0;
const ok = (cond, msg) => { if (!cond) { console.error(`✗ ${msg}`); process.exit(1); } passed++; console.log(`✓ ${msg}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function client(name) {
  let cookie = "";
  const call = async (method, path, body) => {
    const res = await fetch(BASE + path, { method, headers: { "Content-Type": "application/json", cookie }, body: body ? JSON.stringify(body) : undefined });
    const set = res.headers.get("set-cookie");
    if (set) cookie = set.split(";")[0];
    return { status: res.status, data: await res.json().catch(() => ({})) };
  };
  return { name, cookie: () => cookie, get: (p) => call("GET", p), post: (p, b) => call("POST", p, b ?? {}) };
}

const host = client("host"), guest = client("guest"), j1 = client("j1"), j2 = client("j2");
for (const c of [host, guest, j1, j2]) {
  const r = await c.post("/api/auth/signup", { username: `${c.name}_${tag}`, password: "correct-horse", displayName: c.name });
  ok(r.status === 200, `sign up ${c.name}`);
}
ok((await guest.post("/api/auth/signup", { username: `guest_${tag}`, password: "correct-horse" })).status === 409, "duplicate username rejected");
ok((await client("anon").post("/api/battles", { config: { mode: "friend" } })).status === 401, "creating a battle requires sign-in");

// Create a 10-second, €300, two-category battle.
const cfg = { mode: "friend", timerSeconds: 10, budgetCents: 30000, slots: ["top", "bottoms"], turnOrder: "alternating", voteTarget: 2 };
let r = await host.post("/api/battles", { config: cfg });
ok(r.status === 201 && r.data.battle.status === "waiting", "friend battle created and waiting");
const id = r.data.battle.id;
const code = r.data.battle.invite.code;
ok(/^[A-Z2-9]{6}$/.test(code), "invite code issued to host");
ok((await guest.get(`/api/battles/${id}`)).data.battle.invite === null, "invite code hidden from non-host");
ok((await guest.post("/api/join", { code: "ZZZZZZ" })).status === 404, "bad invite code rejected");
r = await guest.post("/api/join", { code });
ok(r.status === 200 && r.data.battle.status === "active", "guest joins, battle starts");
const deadline0 = r.data.battle.turns[0].deadline;
ok(deadline0 - r.data.battle.turns[0].startedAt === 10_000, "turn deadline stored on server");
ok((await host.get(`/api/battles/${id}`)).data.battle.turns[0].deadline === deadline0, "reloading does not move the deadline");

// Run with GRAILED_FEED_FILE=tests/fixtures/smoke-feed.json (a verified test feed).
const L = (id) => `feed:${id}`;
r = await host.get("/api/products/search?slot=bottoms");
ok(r.status === 200 && r.data.liveSource === true && r.data.items.length > 0 && r.data.items.every((i) => i.slot === "bottoms" && i.source === "feed"), "search returns verified pieces for the category");
r = await host.get("/api/products/search?slot=top&sort=price_asc");
const prices = r.data.items.map((i) => i.priceCents);
ok(prices.length > 1 && prices.every((p, i) => i === 0 || p >= prices[i - 1]), "category filter and sort work");

// The exact Dior URL: format valid; not in this source, so honestly unavailable
const DIOR = "https://www.grailed.com/listings/106515727-dior-dior-homme-japan-kris-van-assche-dirty-washed-black-jeans";
r = await host.post("/api/products/validate-url", { url: DIOR });
ok(r.data.ok === true && r.data.listingId === "106515727", "Dior listing URL passes format validation");
r = await host.post("/api/products/resolve", { url: DIOR });
ok(r.data.status === "not_found" && r.data.listing.id === "106515727", "Dior listing: reported unavailable from the source, not faked");
r = await host.post("/api/products/resolve", { url: DIOR + DIOR });
ok(r.data.status === "invalid_url" && r.data.code === "multiple_urls", "two pasted URLs are refused with a clear message");
r = await host.post("/api/products/resolve", { url: "https://www.grailed.com/listings/7000002-smoke-fixture" });
ok(r.data.status === "found" && r.data.product.slot === "top" && r.data.product.priceCents === 9000, "a listing in the source imports with its verified price and category");

// No unverified pricing in battles
r = await host.post(`/api/battles/${id}/select`, { expectedTurn: 0, manual: { listingUrl: "https://www.grailed.com/listings/123456789", title: "Hoodie", priceEur: "1" } });
ok(r.status === 422 && r.data.error.code === "verified_only", "hand-entered pieces and prices are refused");

ok((await guest.post(`/api/battles/${id}/select`, { expectedTurn: 0, productId: L(7000001) })).status === 403, "guest can't pick on host's turn");
r = await host.post(`/api/battles/${id}/select`, { expectedTurn: 0, productId: L(7000004) });
ok(r.status === 400 && r.data.error.code === "wrong_category", "a bottoms piece can't fill the tops round");
r = await host.post(`/api/battles/${id}/select`, { expectedTurn: 0, productId: L(7000001) });
ok(r.status === 200 && r.data.battle.currentTurn === 1, "host locks in a top");
ok((await host.post(`/api/battles/${id}/select`, { expectedTurn: 0, productId: L(7000003) })).status === 409, "duplicate submission rejected");
ok((await guest.post(`/api/battles/${id}/select`, { expectedTurn: 1, productId: L(7000001) })).data.error?.code === "already_taken", "same listing can't be taken twice");
r = await guest.post(`/api/battles/${id}/select`, { expectedTurn: 1, productId: L(7000002) });
ok(r.status === 200 && r.data.item.slot === "top" && r.data.item.subcategory === "hoodies" && r.data.item.priceCents === 9000, "a hoodie is a top, at its verified price");
const hostSpent = r.data.battle.spent[0];

r = await host.post(`/api/battles/${id}/select`, { expectedTurn: 2, productId: L(7000005) });
ok(r.status === 422 && r.data.error.code === "over_budget", "over-budget pick blocked");
ok((await host.post("/api/products/validate-url", { url: "https://example.com/listings/123" })).data.ok === false, "non-Grailed URL rejected");
ok((await host.post("/api/products/validate-url", { url: "https://www.grailed.com/designers/rick-owens" })).data.code === "not_a_listing", "non-listing Grailed URL rejected");
r = await host.post(`/api/battles/${id}/select`, { expectedTurn: 2, productId: L(7000006) });
ok(r.status === 200 && r.data.item.source === "feed" && r.data.item.priceCents === 5000, "verified piece locked at the source's price");
ok(r.data.battle.spent[0] === hostSpent + 5000, "total updates with the locked price");

// Timer expiry: guest goes idle
const turn3 = r.data.battle.turns[3];
await sleep(turn3.deadline - Date.now() + 400);
const late = await guest.post(`/api/battles/${id}/select`, { expectedTurn: 3, productId: L(7000007) });
ok(late.status === 409 && late.data.error.code === "deadline_passed", "pick after the deadline is rejected");
r = await host.get(`/api/battles/${id}`);
ok(r.data.battle.turns[3].status === "expired" && r.data.battle.status === "voting", "expired turn left empty, battle moves to voting");

// Voting
ok((await host.post(`/api/battles/${id}/vote`, { seat: 0 })).status === 403, "players can't vote");
ok((await j1.post(`/api/battles/${id}/vote`, { seat: 1 })).status === 200, "judge 1 votes");
ok((await j1.post(`/api/battles/${id}/vote`, { seat: 0 })).status === 409, "duplicate vote rejected");
ok((await j1.get(`/api/battles/${id}`)).data.battle.votes.tally === null, "tally hidden while voting is open");
r = await j2.post(`/api/battles/${id}/vote`, { seat: 1 });
ok(r.data.battle.status === "complete" && r.data.battle.winner === 1 && r.data.battle.votes.tally[1] === 2, "vote target closes voting with correct winner");
ok((await j2.post(`/api/battles/${id}/vote`, { seat: 1 })).status === 409, "no votes after close");

// Try-on degrades gracefully without a key
r = await fetch(BASE + "/api/tryon").then((x) => x.json());
if (!r.configured) {
  const fd = new FormData();
  fd.set("battleId", id); fd.set("seat", "0"); fd.set("consent", "yes");
  fd.set("photo", new Blob([Buffer.from([0xff, 0xd8, 0xff, 0x00])], { type: "image/jpeg" }), "p.jpg");
  const res = await fetch(BASE + "/api/tryon/photos", { method: "POST", body: fd, headers: { cookie: host.cookie() } });
  ok(res.status === 503, "try-on without FAL_KEY returns a clear setup error, nothing stored");
  ok((await host.get(`/api/battles/${id}/tryons`)).data.configured === false, "reveal is told try-on isn't configured");
}

// Matchmaking pairs two real players
r = await host.post("/api/matchmaking", { config: { timerSeconds: 30, slots: ["top"] } });
ok(r.data.matched === false && r.data.battle.status === "waiting", "first player waits in the queue");
const qid = r.data.battle.id;
r = await guest.post("/api/matchmaking", { config: {} });
ok(r.data.matched === true && r.data.battle.id === qid && r.data.battle.status === "active", "second player is matched into the same battle");

// Stats
r = await guest.get(`/api/battles`);
ok(r.data.battles.length >= 2, "battle history lists the player's battles");

console.log(`\n${passed} checks passed`);
