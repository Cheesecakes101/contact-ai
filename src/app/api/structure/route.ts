import { aiEnabled, structureContext } from "@/lib/ai";
import { body, error, handleError, json, str } from "@/lib/http";
import type { StructuredContext } from "@/lib/types";

export async function POST(req: Request) {
  const b = await body<{ name: string; text: string; existing: StructuredContext }>(req);
  const text = str(b.text, 20000).trim();
  if (!text) return error("Say or type something about this person first");
  try {
    const result = await structureContext({ name: str(b.name, 200), text, existing: b.existing ?? null });
    return json({ result, ai: aiEnabled() });
  } catch (e) {
    return handleError(e);
  }
}
