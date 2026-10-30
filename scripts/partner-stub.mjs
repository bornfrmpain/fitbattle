// Local stand-in for an AUTHORIZED Grailed listing source (test only). Serves the
// fixture listings in tests/fixtures/listings and their photos over https.
//   GET  /listings/:id         listing record (FeedRecord JSON) or 404
//   GET  /img/:file, /img2/:file   photos; /img2 = "re-issued" URLs after a refresh
//   POST /__break {files}      make those /img/ files return 404
//   POST /__rotate {id}        future lookups for that listing return /img2/ URLs
//   POST /__reset              undo all of the above (each test suite starts with this)
import https from "node:https";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
const DIR = path.resolve("tests/fixtures/listings");
const PORT = Number(process.env.PARTNER_PORT || 4444);
const HOST = `https://localhost:${PORT}`;
const records = JSON.parse(fs.readFileSync(path.join(DIR, "listings.json"), "utf8"));
const broken = new Set(), rotated = new Set();
execSync(`openssl req -x509 -newkey rsa:2048 -nodes -keyout /tmp/pk.pem -out /tmp/pc.pem -days 1 -subj /CN=localhost 2>/dev/null`);
https.createServer({ key: fs.readFileSync("/tmp/pk.pem"), cert: fs.readFileSync("/tmp/pc.pem") }, (req, res) => {
  const u = new URL(req.url, HOST);
  const send = (code, body, type = "application/json") => { res.writeHead(code, { "Content-Type": type }); res.end(type === "application/json" ? JSON.stringify(body) : body); };
  if (req.method === "POST") {
    let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => {
      const j = JSON.parse(b || "{}");
      if (u.pathname === "/__break") (j.files || []).forEach((f) => broken.add(f));
      if (u.pathname === "/__rotate") rotated.add(String(j.id));
      if (u.pathname === "/__reset") { broken.clear(); rotated.clear(); }
      send(200, { ok: true });
    });
    return;
  }
  let m = u.pathname.match(/^\/listings\/(\d+)$/);
  if (m) {
    const r = records.find((x) => x.listing_url.includes(`/listings/${m[1]}-`));
    if (!r) return send(404, { error: "not found" });
    const base = rotated.has(m[1]) ? `${HOST}/img2/` : `${HOST}/img/`;
    return send(200, JSON.parse(JSON.stringify(r).replaceAll("__HOST__/img/", base)));
  }
  m = u.pathname.match(/^\/(img2?)\/([\w.-]+\.jpg)$/);
  if (m && fs.existsSync(path.join(DIR, m[2])) && !(m[1] === "img" && broken.has(m[2]))) return send(200, fs.readFileSync(path.join(DIR, m[2])), "image/jpeg");
  send(404, { error: "not found" });
}).listen(PORT, () => console.log(`partner stub on ${HOST}`));
