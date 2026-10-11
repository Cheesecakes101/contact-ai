import { draftReconnect } from "@/lib/ai";
import { getContact, listInteractions } from "@/lib/db";
import { error, handleError, json } from "@/lib/http";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const contact = getContact(id);
  if (!contact) return error("Not found", 404);
  try {
    return json(await draftReconnect(contact, listInteractions(id)));
  } catch (e) {
    return handleError(e);
  }
}
