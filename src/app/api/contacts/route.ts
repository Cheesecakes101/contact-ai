import { createContact, listContacts } from "@/lib/db";
import { body, error, json, str } from "@/lib/http";
import { CATEGORIES, type Category, type StructuredContext } from "@/lib/types";

export const dynamic = "force-dynamic";

export function GET() {
  return json({ contacts: listContacts() });
}

const isCategory = (v: unknown): v is Category => CATEGORIES.some((c) => c.id === v);

export async function POST(req: Request) {
  const b = await body<{
    name: string; phone: string; email: string; company: string; role: string;
    category: string; rawContext: string; context: StructuredContext; notes: string; metAt: string;
  }>(req);
  const name = str(b.name, 200).trim();
  if (!name) return error("Name is required");
  const contact = createContact({
    name,
    phone: str(b.phone, 100),
    email: str(b.email, 200),
    company: str(b.company, 200),
    role: str(b.role, 200),
    category: isCategory(b.category) ? b.category : "acquaintance",
    rawContext: str(b.rawContext, 20000),
    context: b.context ?? null,
    notes: str(b.notes, 20000),
  });
  return json({ contact }, 201);
}
