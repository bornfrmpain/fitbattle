// Streamer branding. Everything is optional and set through env vars, so one
// deployment per streamer can carry their name, logo and the two player colours.
const HEX = /^#[0-9a-fA-F]{6}$/;
const hex = (v: string | undefined, fallback: string) => (v && HEX.test(v) ? v : fallback);

export interface Brand {
  appName: string;
  streamerName: string | null;
  streamerHandle: string | null;
  streamerUrl: string | null;
  logoUrl: string | null;
  colors: { p1: string; p2: string };
}

export function getBrand(): Brand {
  const logo = process.env.STREAMER_LOGO_URL?.trim() || null;
  const url = process.env.STREAMER_URL?.trim() || null;
  return {
    appName: process.env.APP_NAME?.trim() || "FIT/DUEL",
    streamerName: process.env.STREAMER_NAME?.trim().slice(0, 32) || null,
    streamerHandle: process.env.STREAMER_HANDLE?.trim().slice(0, 32) || null,
    streamerUrl: url && /^https:\/\//.test(url) ? url : null,
    logoUrl: logo && (/^https:\/\//.test(logo) || /^\/[\w./-]+$/.test(logo)) ? logo : null,
    colors: { p1: hex(process.env.BRAND_P1, "#6B3BFF"), p2: hex(process.env.BRAND_P2, "#2E5CFF") },
  };
}

export const brandCss = (b: Brand) => `:root{--brand-p1:${b.colors.p1};--brand-p2:${b.colors.p2};}`;
