import { countRoomCards, getRoom, upsertRoomCard } from "@/lib/db";
import { body, error, json, str } from "@/lib/http";

const MAX_CARDS = 1000;

export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const room = getRoom(code);
  if (!room) return error("Room not found", 404);
  if (room.status !== "open") return error("This room is closed", 409);
  const b = await body<{ name: string; phone: string; email: string; profession: string; links: string[]; editToken: string }>(req);
  const name = str(b.name, 120).trim();
  if (!name) return error("Name is required");
  const phone = str(b.phone, 60).trim();
  const email = str(b.email, 200).trim();
  if (!phone && !email) return error("Add a phone number or email so people can reach you");
  if (!b.editToken && countRoomCards(code) >= MAX_CARDS) return error("This room is full", 409);
  const links = (Array.isArray(b.links) ? b.links : [])
    .map((l) => str(l, 300).trim())
    .filter(Boolean)
    .slice(0, 5);
  const result = upsertRoomCard(
    code,
    { name, phone, email, profession: str(b.profession, 200).trim(), links },
    str(b.editToken, 100) || undefined,
  );
  return json(result, 201);
}
