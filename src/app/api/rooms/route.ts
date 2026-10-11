import { createRoom } from "@/lib/db";
import { body, json, str } from "@/lib/http";

export async function POST(req: Request) {
  const b = await body<{ name: string }>(req);
  const { room, hostToken } = createRoom(str(b.name, 120).trim());
  return json({ room, hostToken }, 201);
}
