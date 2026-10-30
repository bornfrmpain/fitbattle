// Runs every browser test against fresh servers:
//   :3300 with the partner stub as authorized listing source, :3301 with no source at all.
// Usage: npm run build && npm run test:e2e   (needs Python 3 + Playwright with Chromium)
import { spawn, execSync } from "node:child_process";
import fs from "node:fs";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const only = process.argv.slice(2);
const stub = spawn("node", ["scripts/partner-stub.mjs"], { stdio: "ignore", detached: true });
const start = (port, env) => spawn("npx", ["next", "start", "-p", String(port)], {
  env: { ...process.env, DATA_DIR: fs.mkdtempSync(`/tmp/fd-e2e-${port}-`), NEXT_TELEMETRY_DISABLED: "1", ...env }, stdio: "ignore", detached: true });
const src = start(3300, { GRAILED_LISTING_LOOKUP_URL: "https://localhost:4444/listings/{id}", IMAGE_FETCH_ALLOW_PRIVATE: "1", NODE_TLS_REJECT_UNAUTHORIZED: "0" });
const nosrc = start(3301, {});
const stop = () => { for (const c of [src, nosrc, stub]) try { process.kill(-c.pid); } catch {} };
const suites = [
  ["images", "python3 scripts/images_acceptance.py http://localhost:3300 docs/screenshots http://localhost:3301"],
  ["battle", "python3 scripts/battle_e2e.py http://localhost:3300 docs/screenshots"],
  ["wheel", "python3 scripts/wheel_e2e.py http://localhost:3301 docs/screenshots"],
];
let failed = false;
try {
  for (const port of [3300, 3301]) for (let i = 0; i < 60; i++) { try { if ((await fetch(`http://localhost:${port}`)).ok) break; } catch {} await sleep(500); }
  for (const [name, cmd] of suites) {
    if (only.length && !only.includes(name)) continue;
    console.log(`\n=== ${name} ===`);
    try { execSync(cmd, { stdio: "inherit" }); } catch { failed = true; console.error(`!!! ${name} failed`); }
  }
} finally { stop(); }
process.exit(failed ? 1 : 0);
