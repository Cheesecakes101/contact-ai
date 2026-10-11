import { enrichContact } from "@/lib/ai";
import { getContact, updateContact } from "@/lib/db";
import { error, handleError, json } from "@/lib/http";

export const maxDuration = 120;

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const contact = getContact(id);
  if (!contact) return error("Not found", 404);
  try {
    const enrichment = await enrichContact(contact);
    return json({ contact: updateContact(id, { enrichment }) });
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return json({ contact: updateContact(id, { enrichment: null }) });
}
