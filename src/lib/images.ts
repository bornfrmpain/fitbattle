// Server-side image download for product photos (try-on input, share-card export).
// URLs come from player-entered listings, so this guards against SSRF: https only,
// public addresses only, a size cap, image content types only, re-checked redirects.
import dns from "node:dns/promises";
import net from "node:net";

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const allowPrivate = () => process.env.IMAGE_FETCH_ALLOW_PRIVATE === "1"; // test-only escape hatch

export class ImageFetchError extends Error {}

function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const v = ip.toLowerCase();
  if (v.startsWith("::ffff:")) return isPrivateIp(v.slice(7));
  return v === "::1" || v === "::" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80");
}

async function assertPublicHttps(raw: string): Promise<URL> {
  let u: URL;
  try { u = new URL(raw); } catch { throw new ImageFetchError("Invalid image URL."); }
  if (u.protocol !== "https:") throw new ImageFetchError("Image URLs must use https.");
  if (allowPrivate()) return u;
  const addrs = net.isIP(u.hostname) ? [{ address: u.hostname }] : await dns.lookup(u.hostname, { all: true }).catch(() => []);
  if (!addrs.length) throw new ImageFetchError("Image host can't be resolved.");
  if (addrs.some((a) => isPrivateIp(a.address))) throw new ImageFetchError("Image host isn't a public address.");
  return u;
}

export async function fetchImage(raw: string, opts: { maxBytes?: number; truncate?: boolean } = {}): Promise<{ buf: Buffer; type: string }> {
  const cap = opts.maxBytes ?? MAX_IMAGE_BYTES;
  let url = raw;
  for (let hop = 0; hop < 4; hop++) {
    const u = await assertPublicHttps(url);
    let res: Response;
    try {
      res = await fetch(u, { redirect: "manual", signal: AbortSignal.timeout(opts.truncate ? 6_000 : 15_000), headers: { Accept: "image/*", ...(opts.truncate ? { Range: `bytes=0-${cap - 1}` } : {}) } });
    } catch {
      throw new ImageFetchError("Couldn't download the product image.");
    }
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      url = new URL(res.headers.get("location")!, u).toString();
      continue;
    }
    if (!res.ok && res.status !== 206) throw new ImageFetchError(`The product image returned ${res.status}.`);
    const type = (res.headers.get("content-type") || "").split(";")[0].trim();
    if (!/^image\/(jpeg|png|webp|gif|avif)$/.test(type)) throw new ImageFetchError("That link isn't an image.");
    const len = Number(res.headers.get("content-length") || 0);
    if (len > cap && !opts.truncate) throw new ImageFetchError("The product image is too large.");
    const reader = res.body?.getReader();
    if (!reader) throw new ImageFetchError("Empty image response.");
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      chunks.push(value);
      if (total >= cap) {
        reader.cancel().catch(() => {});
        if (opts.truncate) break;
        throw new ImageFetchError("The product image is too large.");
      }
    }
    return { buf: Buffer.concat(chunks), type };
  }
  throw new ImageFetchError("Too many redirects.");
}

export const toDataUri = (buf: Buffer, type: string) => `data:${type};base64,${buf.toString("base64")}`;

/** Reads pixel dimensions from JPEG, PNG or WebP header bytes. */
export function imageSize(b: Buffer): { width: number; height: number } | null {
  if (b.length > 24 && b.readUInt32BE(0) === 0x89504e47) return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
  if (b.length > 30 && b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP") {
    const kind = b.toString("ascii", 12, 16);
    if (kind === "VP8X") return { width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3) };
    if (kind === "VP8L") { const v = b.readUInt32LE(21); return { width: 1 + (v & 0x3fff), height: 1 + ((v >> 14) & 0x3fff) }; }
    if (kind === "VP8 ") return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
  }
  if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const marker = b[i + 1];
      const len = b.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { height: b.readUInt16BE(i + 5), width: b.readUInt16BE(i + 7) };
      i += 2 + len;
    }
  }
  return null;
}

/** Downloads only the first bytes of an image to learn its size. Nothing is stored. */
export async function probeImage(url: string): Promise<{ width: number; height: number } | null> {
  try {
    const { buf } = await fetchImage(url, { maxBytes: 128 * 1024, truncate: true });
    return imageSize(buf);
  } catch {
    return null;
  }
}
