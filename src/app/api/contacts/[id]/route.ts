import { deleteContact, getContact, listInteractions, listReminders, updateContact, type ContactInput } from "@/lib/db";
import { body, error, json } from "@/lib/http";
import { CATEGORIES } from "@/lib/types";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const contact = getContact(id);
  if (!contact) return error("Not found", 404);
  return json({ contact, interactions: listInteractions(id), reminders: listReminders(id) });
}

const EDITABLE = ["name", "phone", "email", "company", "role", "category", "rawContext", "context", "enrichment", "notes"] as const;

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  const b = await body<ContactInput>(req);
  const patch: ContactInput = {};
  for (const k of EDITABLE) if (b[k] !== undefined) (patch as Record<string, unknown>)[k] = b[k];
  if (patch.category && !CATEGORIES.some((c) => c.id === patch.category)) return error("Invalid category");
  if (patch.name !== undefined && !String(patch.name).trim()) return error("Name is required");
  const contact = updateContact(id, patch);
  if (!contact) return error("Not found", 404);
  return json({ contact });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  deleteContact(id);
  return json({ ok: true });
}
