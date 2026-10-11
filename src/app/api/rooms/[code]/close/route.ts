import { closeRoom, getRoom, isRoomHost } from "@/lib/db";
import { error, json } from "@/lib/http";

export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  if (!getRoom(code)) return error("Room not found", 404);
  if (!isRoomHost(code, req.headers.get("x-host-token"))) return error("Only the host can close this room", 403);
  closeRoom(code);
  return json({ room: getRoom(code) });
}
