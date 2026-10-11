import { deleteReminder, updateReminder } from "@/lib/db";
import { body, json } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  const b = await body<{ done: boolean; snoozeDays: number }>(req);
  const dueAt =
    typeof b.snoozeDays === "number" && b.snoozeDays > 0
      ? new Date(Date.now() + b.snoozeDays * 86_400_000).toISOString()
      : undefined;
  updateReminder(id, { done: typeof b.done === "boolean" ? b.done : undefined, dueAt });
  return json({ ok: true });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  deleteReminder((await params).id);
  return json({ ok: true });
}
