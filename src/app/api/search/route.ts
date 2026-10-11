import { keywordSearch, searchContacts } from "@/lib/ai";
import { listContacts, listInteractions } from "@/lib/db";
import { body, error, json, str } from "@/lib/http";
import type { Interaction } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const b = await body<{ q: string }>(req);
  const q = str(b.q, 500).trim();
  if (!q) return error("Ask a question");
  const contacts = listContacts();
  const byId = new Map(contacts.map((c) => [c.id, c]));
  const interactions = new Map<string, Interaction[]>(contacts.map((c) => [c.id, listInteractions(c.id)]));
  let result;
  try {
    result = await searchContacts(q, contacts, interactions);
  } catch (e) {
    console.error(e);
    result = { answer: "", matches: keywordSearch(q, contacts), mode: "keyword" as const };
  }
  return json({
    answer: result.answer,
    mode: result.mode,
    results: result.matches.map((m) => ({ ...m, contact: byId.get(m.id)! })),
  });
}
