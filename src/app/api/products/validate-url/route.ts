import { handle, json, readJson } from "@/lib/http";
import { parseGrailedListingUrl } from "@/lib/products/listingUrl";
export const POST = handle(async (req: Request) => json(parseGrailedListingUrl(String((await readJson(req)).url ?? ""))));
