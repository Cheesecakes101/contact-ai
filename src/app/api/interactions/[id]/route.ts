import { deleteInteraction } from "@/lib/db";
import { json } from "@/lib/http";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  deleteInteraction((await params).id);
  return json({ ok: true });
}
