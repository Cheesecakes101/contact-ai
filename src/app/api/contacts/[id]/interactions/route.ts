import { addInteraction, getContact } from "@/lib/db";
import { body, error, json, str } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!getContact(id)) return error("Not found", 404);
  const b = await body<{ date: string; kind: string; summary: string }>(req);
  const date = str(b.date, 40) || new Date().toISOString();
  if (Number.isNaN(Date.parse(date))) return error("Invalid date");
  const interaction = addInteraction(id, new Date(date).toISOString(), str(b.kind, 40) || "note", str(b.summary, 5000));
  return json({ interaction, contact: getContact(id) }, 201);
}
