import { getRoom, isRoomHost, listRoomCards } from "@/lib/db";
import { error } from "@/lib/http";
import { toVCardFile } from "@/lib/vcard";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const room = getRoom(code);
  if (!room) return error("Room not found", 404);
  const url = new URL(req.url);
  const host = isRoomHost(code, req.headers.get("x-host-token") ?? url.searchParams.get("host"));
  if (room.status !== "closed" && !host) return error("The host hasn't closed this room yet", 409);
  const note = room.name ? `Met at ${room.name}` : `Contact Drop ${room.code}`;
  const vcf = toVCardFile(
    listRoomCards(code).map((c) => ({
      name: c.name,
      phone: c.phone,
      email: c.email,
      role: c.profession,
      urls: c.links,
      note,
    })),
  );
  return new Response(vcf, {
    headers: {
      "Content-Type": "text/vcard; charset=utf-8",
      "Content-Disposition": 'attachment; filename="contacts.vcf"',
      "Cache-Control": "no-store",
    },
  });
}
