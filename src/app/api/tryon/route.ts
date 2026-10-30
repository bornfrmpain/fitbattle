import { json } from "@/lib/http";
import { extrasEnabled, PRICING, tryOnConfigured } from "@/lib/tryon/provider";
export const GET = async () => json({ configured: tryOnConfigured(), extras: extrasEnabled(), pricing: PRICING });
