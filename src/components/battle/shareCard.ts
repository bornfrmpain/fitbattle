// Renders the final result as a 1600×900 PNG in the browser. Every image is same-origin
// (product photos go through /api/battles/:id/items/:itemId/image, try-on results through
// their own route), so the canvas stays exportable.
import type { BattleView } from "@/lib/battle/repo";
import type { Brand } from "@/lib/brand";
import { fmt } from "@/lib/battle/rules";
import { SLOT_LABEL, slotLabel } from "@/lib/categories";

const W = 1600, H = 900;
const FONT = "'Geist Variable', system-ui, sans-serif";
const DISPLAY = "'Unbounded Variable', 'Geist Variable', sans-serif";

function load(src: string): Promise<HTMLImageElement | null> {
  return new Promise((res) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => res(null);
    img.src = src;
  });
}
function cover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const r = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const sw = w / r, sh = h / r;
  ctx.drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh, x, y, w, h);
}
function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath(); ctx.roundRect(x, y, w, h, r);
}
/** A small label chip. `dark` = night surface with white text, otherwise frosted white. */
function sticker(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, dark = false) {
  ctx.save(); ctx.translate(x, y);
  ctx.font = `700 ${size}px ${FONT}`;
  const w = ctx.measureText(text).width + size * 0.9, h = size * 1.6;
  ctx.shadowColor = "rgba(42,31,106,.18)"; ctx.shadowBlur = 16; ctx.shadowOffsetY = 6;
  ctx.fillStyle = dark ? "#12111C" : "rgba(255,255,255,.94)"; roundRect(ctx, -w / 2, -h / 2, w, h, h / 3); ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.fillStyle = dark ? "#ffffff" : "#0E0D16"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(text, 0, 1);
  ctx.restore();
}

export async function exportShareCard(view: BattleView, brand: Brand, resultJob: (seat: 0 | 1) => string | null): Promise<Blob> {
  await document.fonts?.ready;
  const css = getComputedStyle(document.documentElement);
  const colors = [css.getPropertyValue("--brand-p1").trim() || "#6B3BFF", css.getPropertyValue("--brand-p2").trim() || "#2E5CFF"];
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const ctx = c.getContext("2d")!;
  const bg = ctx.createLinearGradient(0, 0, W, H); bg.addColorStop(0, "#EEE9FD"); bg.addColorStop(0.5, "#F5F4F9"); bg.addColorStop(1, "#E6ECFF");
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = "#0E0D16"; ctx.font = `700 34px ${DISPLAY}`; ctx.textBaseline = "alphabetic"; ctx.textAlign = "left";
  ctx.fillText(brand.appName.toLowerCase() + (brand.streamerName ? ` × ${brand.streamerName}` : ""), 40, 62);
  ctx.textAlign = "right"; ctx.font = `700 24px ${FONT}`;
  ctx.fillText(view.status === "complete" ? `Final vote ${view.votes.tally?.[0] ?? 0}–${view.votes.tally?.[1] ?? 0}` : `Voting open · ${view.votes.count}/${view.votes.target} votes`, W - 40, 60);

  const seats: (0 | 1)[] = view.config.mode === "solo" ? [0] : [0, 1];
  const GUT = 120;
  const colW = seats.length === 1 ? W - 80 : (W - 80 - GUT) / 2;
  for (const seat of seats) {
    const x0 = 40 + seat * (colW + GUT);
    const p = view.seats[seat]!;
    const won = view.status === "complete" && view.winner === seat;
    ctx.fillStyle = colors[seat]; roundRect(ctx, x0, 90, colW, 100, 18); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.textAlign = "left"; ctx.font = `700 48px ${DISPLAY}`; ctx.fillText(p.name, x0 + 24, 156);
    ctx.textAlign = "right"; ctx.font = `700 26px ${FONT}`; ctx.fillText(`Total ${fmt(view.spent[seat])}`, x0 + colW - 24, 132);

    let gx = x0, gw = colW;
    const top = 210, bottom = 840, areaH = bottom - top;
    const jobId = resultJob(seat);
    if (jobId) {
      const img = await load(`/api/tryon/jobs/${jobId}/image`);
      if (img) {
        const tw = Math.round(areaH * 0.66);
        ctx.save(); roundRect(ctx, x0, top, tw, areaH, 16); ctx.clip(); cover(ctx, img, x0, top, tw, areaH); ctx.restore();
        
        sticker(ctx, "AI visualization", x0 + 110, top + 34, 16);
        gx = x0 + tw + 16; gw = colW - tw - 16;
      }
    }
    const items = view.config.slots.map((slot) => view.items.find((i) => i.seat === seat && i.slot === slot) ?? null);
    const cols = gw > 500 ? 3 : 2, rows = Math.ceil(items.length / cols);
    const gap = 12, cw = (gw - gap * (cols - 1)) / cols, ch = (areaH - gap * (rows - 1)) / rows;
    for (const [i, item] of items.entries()) {
      const x = gx + (i % cols) * (cw + gap), y = top + Math.floor(i / cols) * (ch + gap);
      ctx.fillStyle = "#ffffff"; roundRect(ctx, x, y, cw, ch, 16); ctx.fill();
      if (item) {
        const img = item.imageUrl || item.images?.length ? await load(`/api/battles/${view.id}/items/${item.outfitItemId}/image`) : null;
        if (img) { ctx.save(); roundRect(ctx, x, y, cw, ch, 12); ctx.clip(); cover(ctx, img, x, y, cw, ch); ctx.restore(); }
        ctx.fillStyle = "rgba(255,255,255,.92)"; ctx.fillRect(x, y + ch - 34, cw, 34);
        ctx.fillStyle = "#121212"; ctx.textAlign = "left"; ctx.font = `700 16px ${FONT}`;
        ctx.fillText((item.brand ?? item.title).slice(0, 24), x + 10, y + ch - 12);
        sticker(ctx, fmt(item.priceCents), x + cw - 50, y + 26, 15);
      } else {
        ctx.fillStyle = "#5E5B72"; ctx.textAlign = "center"; ctx.font = `600 16px ${FONT}`; ctx.fillText(`${slotLabel(view.config.slots[i])}: empty`, x + cw / 2, y + ch / 2);
      }
      
    }
    if (won) {
      ctx.font = `700 48px ${DISPLAY}`;
      const nameW = ctx.measureText(p.name).width;
      sticker(ctx, "WINNER", x0 + 24 + nameW + 90, 140, 22, true);
    }
  }
  if (seats.length === 2) sticker(ctx, "VS", W / 2, 520, 34, true);
  ctx.fillStyle = "#5E5B72"; ctx.textAlign = "left"; ctx.font = `500 15px ${FONT}`;
  ctx.fillText("Listed prices at the moment each piece was picked, before shipping and fees. AI visualizations are approximations, not fittings.", 40, 878);

  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("Export failed."))), "image/png"));
}
