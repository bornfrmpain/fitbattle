import { handle, json, readJson, requireUser } from "@/lib/http";
import { createWheel, listWheels } from "@/lib/wheel/repo";

export const GET = handle(async () => json({ wheels: listWheels((await requireUser()).id) }));
export const POST = handle(async (req: Request) => {
  const user = await requireUser();
  return json({ wheel: createWheel(user.id, await readJson(req)) }, 201);
});
