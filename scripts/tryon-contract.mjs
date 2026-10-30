// Try-on CONTRACT test. Runs the real app pipeline (upload, validation, job runner, product
// image download, model chaining, storage, permissions) against a local HTTPS stub that
// enforces fal.ai's documented request/response schema for FASHN v1.6 and Nano Banana edit.
//
// This does NOT test the real fal.ai service or image quality. The stub returns a fixed
// image that says "TEST STUB OUTPUT". To test the real service, see README "Testing try-on".
//
// Usage: npm run build && npm run test:tryon-contract
import https from "node:https";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, execSync } from "node:child_process";

const FIX = path.resolve("tests/fixtures/tryon");
const STUB_PORT = 4443, APP_PORT = 3200;
const STUB = `https://localhost:${STUB_PORT}`, APP = `http://localhost:${APP_PORT}`;
let passed = 0;
const ok = (c, m) => { if (!c) { console.error(`✗ ${m}`); cleanup(); process.exit(1); } passed++; console.log(`✓ ${m}`); };
const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");
const fixture = (n) => fs.readFileSync(path.join(FIX, n));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- stub fal.ai -----------------------------------------------------------
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "fd-contract-"));
execSync(`openssl req -x509 -newkey rsa:2048 -nodes -keyout ${tmp}/k.pem -out ${tmp}/c.pem -days 1 -subj /CN=localhost 2>/dev/null`);
const calls = [];
let failNext = false;
// Verified listings served by the stub as an authorized source (battles accept nothing else).
const LISTINGS = {
  "9300001": { title: "Boxy tee", subcategory: "tshirts", price_eur: 100, img: "top.jpg" },
  "9300002": { title: "Cargo pants", subcategory: "trousers", price_eur: 100, img: "bottoms.jpg" },
  "9300003": { title: "Leather boots", subcategory: "boots", price_eur: 100, img: "shoes.jpg" },
  "9300004": { title: "Leather tote bag", subcategory: "bags", price_eur: 100, img: "jacket.jpg" },
  "9300011": { title: "Heavy tee", subcategory: "tshirts", price_eur: 90, img: "top.jpg" },
  "9300012": { title: "Wide trousers", subcategory: "trousers", price_eur: 90, img: "bottoms.jpg" },
  "9300013": { title: "Zip boots", subcategory: "boots", price_eur: 90, img: "shoes.jpg" },
  "9300014": { title: "Silver ring", subcategory: "jewellery", price_eur: 90, img: "jacket.jpg" },
};
const dataUri = (v) => typeof v === "string" && /^data:image\/(jpeg|png|webp);base64,/.test(v);
const decode = (v) => Buffer.from(v.split(",")[1], "base64");
const stub = https.createServer({ key: fs.readFileSync(`${tmp}/k.pem`), cert: fs.readFileSync(`${tmp}/c.pem`) }, (req, res) => {
  const send = (code, body, type = "application/json") => { res.writeHead(code, { "Content-Type": type }); res.end(type === "application/json" ? JSON.stringify(body) : body); };
  if (req.method === "GET" && req.url.startsWith("/img/")) return send(200, fixture(path.basename(req.url)), "image/jpeg");
  if (req.method === "GET" && req.url.startsWith("/out/")) return send(200, fixture("stub-output.jpg"), "image/jpeg");
  const lm = req.method === "GET" && req.url.match(/^\/listings\/(\d+)$/);
  if (lm) {
    const rec = LISTINGS[lm[1]];
    return rec ? send(200, { ...rec, listing_url: `https://www.grailed.com/listings/${lm[1]}-contract`, designer: "Test House", size: "M", images: [{ url: `${STUB}/img/${rec.img}` }] }) : send(404, {});
  }
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", async () => {
    if (req.headers.authorization !== "Key test-key") return send(401, { detail: "bad key" });
    const body = JSON.parse(raw || "{}");
    await sleep(250);
    if (failNext) { failNext = false; return send(422, { detail: "stub-induced failure" }); }
    if (req.url === "/fashn") {
      // FASHN v1.6 schema: model_image + garment_image required; category tops|bottoms|one-pieces|auto
      if (!dataUri(body.model_image) && !String(body.model_image).startsWith(STUB)) return send(422, { detail: "model_image" });
      if (!dataUri(body.garment_image)) return send(422, { detail: "garment_image" });
      if (!["tops", "bottoms", "one-pieces", "auto"].includes(body.category)) return send(422, { detail: "category" });
      calls.push({ model: "fashn", category: body.category, garment: sha(decode(body.garment_image)), seed: body.seed, modelIsPhoto: dataUri(body.model_image) ? sha(decode(body.model_image)) : body.model_image });
      return send(200, { images: [{ url: `${STUB}/out/${calls.length}.jpg` }] });
    }
    if (req.url === "/edit") {
      // Nano Banana edit schema: prompt + image_urls[]
      if (typeof body.prompt !== "string" || !Array.isArray(body.image_urls) || body.image_urls.length < 2) return send(422, { detail: "schema" });
      calls.push({ model: "edit", n: body.image_urls.length, first: body.image_urls[0], garments: body.image_urls.slice(1).map((u) => sha(decode(u))), prompt: body.prompt });
      return send(200, { images: [{ url: `${STUB}/out/${calls.length}.jpg` }], description: "" });
    }
    send(404, {});
  });
});
await new Promise((r) => stub.listen(STUB_PORT, r));

// --- app under test --------------------------------------------------------
const dataDir = path.join(tmp, "data");
const app = spawn("npx", ["next", "start", "-p", String(APP_PORT)], {
  env: { ...process.env, DATA_DIR: dataDir, FAL_KEY: "test-key", GRAILED_LISTING_LOOKUP_URL: `${STUB}/listings/{id}`, FAL_TRYON_ENDPOINT: `${STUB}/fashn`, FAL_EDIT_ENDPOINT: `${STUB}/edit`,
    IMAGE_FETCH_ALLOW_PRIVATE: "1", NODE_TLS_REJECT_UNAUTHORIZED: "0", NEXT_TELEMETRY_DISABLED: "1" },
  stdio: ["ignore", "pipe", "pipe"], detached: true,
});
function cleanup() { try { process.kill(-app.pid); } catch {} stub.close(); }
for (let i = 0; i < 60; i++) { try { if ((await fetch(APP)).ok) break; } catch {} await sleep(500); }

function client() {
  let cookie = "";
  const call = async (method, p, body, raw) => {
    const res = await fetch(APP + p, { method, headers: { cookie, ...(body && !(body instanceof FormData) ? { "Content-Type": "application/json" } : {}) }, body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined });
    const set = res.headers.get("set-cookie"); if (set) cookie = set.split(";")[0];
    if (raw) return res;
    return { status: res.status, data: await res.json().catch(() => ({})) };
  };
  return { get: (p, raw) => call("GET", p, undefined, raw), post: (p, b) => call("POST", p, b), del: (p) => call("DELETE", p) };
}
const host = client(), other = client(), anon = client();
await host.post("/api/auth/signup", { username: "contract_host", password: "correct-horse", displayName: "Host" });
await other.post("/api/auth/signup", { username: "contract_other", password: "correct-horse", displayName: "Other" });

// Battle with the four required categories, every piece entered from a Grailed listing URL.
let r = await host.post("/api/battles", { config: { mode: "local", timerSeconds: 120, budgetCents: 300000, slots: ["top", "bottoms", "footwear", "misc"] }, localOpponentName: "Jun" });
const id = r.data.battle.id;
const pick = { "0:top": 9300001, "0:bottoms": 9300002, "0:footwear": 9300003, "0:misc": 9300004, "1:top": 9300011, "1:bottoms": 9300012, "1:footwear": 9300013, "1:misc": 9300014 };
for (const t of r.data.battle.turns) {
  r = await host.post(`/api/battles/${id}/select`, { expectedTurn: t.index, productId: `feed:${pick[`${t.seat}:${t.slot}`]}` });
  ok(r.status === 200, `turn ${t.index}: verified ${t.slot} locked in`);
}
ok(r.data.battle.status === "voting", "outfits complete, battle in reveal/voting");
const seat0 = r.data.battle.items.filter((i) => i.seat === 0);

r = await host.get(`/api/battles/${id}/tryons`);
ok(r.data.configured === true && r.data.extras === true, "server reports try-on configured");

// Upload validation
const fd = (extra = {}, file = fixture("person.jpg"), type = "image/jpeg") => {
  const f = new FormData(); f.set("battleId", id); f.set("seat", "0"); f.set("consent", "yes");
  for (const [k, v] of Object.entries(extra)) f.set(k, v);
  f.set("photo", new Blob([file], { type }), "photo.jpg"); return f;
};
ok((await host.post("/api/tryon/photos", fd({ consent: "no" }))).status === 400, "upload without consent rejected");
ok((await host.post("/api/tryon/photos", fd({}, Buffer.from("not an image at all"), "image/jpeg"))).status === 415, "non-image bytes rejected (content sniffed, not trusted)");
ok((await host.post("/api/tryon/photos", fd({}, Buffer.alloc(9 * 1024 * 1024, 0xff)))).status === 413, "photo over 8 MB rejected");
ok((await other.post("/api/tryon/photos", fd())).status === 403, "can't upload for someone else's outfit");
r = await host.post("/api/tryon/photos", fd());
ok(r.status === 201, "photo uploaded");
const photoId = r.data.id;

// Generate
r = await host.post("/api/tryon/jobs", { photoId, itemIds: seat0.map((i) => i.outfitItemId), visibility: "public", seed: 42 });
ok(r.status === 202 && r.data.plan.steps.length === 3, "job planned: 2 FASHN steps + 1 edit step");
const jobId = r.data.id;
ok((await host.post("/api/tryon/jobs", { photoId, itemIds: null, visibility: "private" })).status === 429, "second concurrent job refused");
let job, sawProgress = false;
for (let i = 0; i < 60; i++) {
  job = (await host.get(`/api/tryon/jobs/${jobId}`)).data.job;
  if (job.status === "running" && job.step > 0) sawProgress = true;
  if (job.status === "done" || job.status === "failed") break;
  await sleep(150);
}
ok(job.status === "done", `job finished: ${job.status} ${job.error ?? ""}`);
ok(sawProgress, "progress reported step by step");

const fashn = calls.filter((c) => c.model === "fashn"), edit = calls.filter((c) => c.model === "edit");
ok(fashn.map((c) => c.category).join(",") === "bottoms,tops", "FASHN chained bottoms → top with correct categories");
ok(fashn.map((c) => c.garment).join() === [sha(fixture("bottoms.jpg")), sha(fixture("top.jpg"))].join(), "the exact listing photos were sent as garments");
ok(fashn[0].modelIsPhoto === sha(fixture("person.jpg")), "first step used the uploaded photo");
ok(String(fashn[1].modelIsPhoto).startsWith(`${STUB}/out/`), "later steps build on the previous result");
ok(fashn.every((c) => c.seed === 42), "seed passed through");
ok(edit.length === 1 && edit[0].garments.join() === [sha(fixture("shoes.jpg")), sha(fixture("jacket.jpg"))].join() && /shoes/.test(edit[0].prompt), "shoes and the misc piece sent to the edit model with their real product photos");

let res = await host.get(`/api/tryon/jobs/${jobId}/image`, true);
ok(res.ok && sha(Buffer.from(await res.arrayBuffer())) === sha(fixture("stub-output.jpg")), "result stored and served");
res = await host.get(`/api/tryon/jobs/${jobId}/image?download=1`, true);
ok(/attachment/.test(res.headers.get("content-disposition") || ""), "result downloadable");
res = await host.get(`/api/tryon/photos/${photoId}`, true);
ok(res.ok && sha(Buffer.from(await res.arrayBuffer())) === sha(fixture("person.jpg")), "original photo preserved unchanged, separate from result");
ok((await anon.get(`/api/tryon/photos/${photoId}`)).status === 401, "original photo not visible to anonymous users");
ok((await other.get(`/api/tryon/photos/${photoId}`)).status === 404, "original photo not visible to other users");
ok((await anon.get(`/api/tryon/jobs/${jobId}/image`, true)).ok, "public result visible to stream viewers");
ok((await anon.get(`/api/battles/${id}/tryons`)).data.jobs.length === 1, "public result listed in reveal");

// Private result + retry
r = await host.post("/api/tryon/jobs", { photoId, itemIds: [seat0.find((i) => i.slot === "top").outfitItemId], visibility: "private" });
for (let i = 0; i < 40; i++) { job = (await host.get(`/api/tryon/jobs/${r.data.id}`)).data.job; if (job.status !== "running" && job.status !== "queued") break; await sleep(150); }
ok(job.status === "done" && job.steps.length === 1, "second run with one selected piece reuses the stored photo");
ok((await anon.get(`/api/tryon/jobs/${r.data.id}/image`, true)).status === 404, "private result hidden from others");

// Provider failure → clear error, then retry works
failNext = true;
r = await host.post("/api/tryon/jobs", { photoId, itemIds: null, visibility: "private" });
for (let i = 0; i < 40; i++) { job = (await host.get(`/api/tryon/jobs/${r.data.id}`)).data.job; if (job.status === "failed" || job.status === "done") break; await sleep(150); }
ok(job.status === "failed" && /clearer full-body photo/.test(job.error), "provider error surfaces a helpful message");
r = await host.post("/api/tryon/jobs", { photoId, itemIds: null, visibility: "private", seed: job.seed });
for (let i = 0; i < 60; i++) { job = (await host.get(`/api/tryon/jobs/${r.data.id}`)).data.job; if (job.status === "failed" || job.status === "done") break; await sleep(150); }
ok(job.status === "done", "retry after failure succeeds");

// Share-card image proxy
res = await anon.get(`/api/battles/${id}/items/${seat0[0].outfitItemId}/image`, true);
ok(res.ok && res.headers.get("content-type") === "image/jpeg", "share-card export can load product photos same-origin");

// Deletion
ok((await host.del(`/api/tryon/photos/${photoId}`)).status === 200, "photo deleted");
ok((await host.get(`/api/tryon/photos/${photoId}`)).status === 404 && (await host.get(`/api/tryon/jobs/${jobId}/image`, true)).status === 404, "photo and all results removed");
ok(fs.readdirSync(path.join(dataDir, "private")).length === 0, "no files left on disk");

console.log(`\n${passed} contract checks passed (stubbed fal.ai, NOT the real service)`);
cleanup();
process.exit(0);
