import { handle, json, readJson, requireUser } from "@/lib/http";
import { resolveListingUrl } from "@/lib/products/resolve";

// Turns a pasted Grailed listing URL into product data from an authorized source.
export const POST = handle(async (req: Request) => {
  await requireUser();
  const b = await readJson(req);
  return json(await resolveListingUrl(String(b.url ?? "")));
});
