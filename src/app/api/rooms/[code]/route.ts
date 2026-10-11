import { countRoomCards, getRoom, isRoomHost, listRoomCards } from "@/lib/db";
import { error, json } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const room = getRoom(code);
  if (!room) return error("Room not found", 404);
  const isHost = isRoomHost(code, req.headers.get("x-host-token"));
  // Attendees only see who's in the room once the host closes it.
  const cards = isHost || room.status === "closed" ? listRoomCards(code) : null;
  return json({ room, isHost, count: countRoomCards(code), cards });
}
