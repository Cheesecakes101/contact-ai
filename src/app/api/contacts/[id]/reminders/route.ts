import { addReminder, getContact } from "@/lib/db";
import { body, error, json, str } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

/** Accepts either { days: 30 } ("remind me in 30 days") or { dueAt: ISO }. */
export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!getContact(id)) return error("Not found", 404);
  const b = await body<{ days: number; dueAt: string; note: string }>(req);
  let due: Date;
  if (typeof b.days === "number" && b.days > 0 && b.days < 3650) {
    due = new Date(Date.now() + b.days * 86_400_000);
    due.setHours(9, 0, 0, 0);
  } else if (b.dueAt && !Number.isNaN(Date.parse(b.dueAt))) {
    due = new Date(b.dueAt);
  } else {
    return error("Provide days or dueAt");
  }
  const reminder = addReminder(id, due.toISOString(), str(b.note, 1000));
  return json({ reminder }, 201);
}
