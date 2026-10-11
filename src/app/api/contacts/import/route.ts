import { createContact, listContacts } from "@/lib/db";
import { body, json, str } from "@/lib/http";

interface Incoming { name: string; phone?: string; email?: string; company?: string; role?: string; note?: string }

/** Bulk import from the phone's contact picker or a .vcf file. Skips obvious duplicates. */
export async function POST(req: Request) {
  const b = await body<{ contacts: Incoming[]; category: string; metWhere: string }>(req);
  const metWhere = str(b.metWhere, 200).trim();
  const context = metWhere
    ? { summary: "", metWhere, metHow: "Contact Drop", whatTheyDo: "", interests: [], collaboration: [], tags: [metWhere.toLowerCase()] }
    : null;
  const incoming = Array.isArray(b.contacts) ? b.contacts.slice(0, 5000) : [];
  const existing = listContacts();
  const key = (name: string, phone: string, email: string) =>
    `${name.trim().toLowerCase()}|${phone.replace(/\D/g, "").slice(-9)}|${email.trim().toLowerCase()}`;
  const seen = new Set(existing.map((c) => key(c.name, c.phone, c.email)));
  let created = 0;
  let skipped = 0;
  for (const c of incoming) {
    const name = str(c?.name, 200).trim();
    if (!name) { skipped++; continue; }
    const phone = str(c.phone, 100);
    const email = str(c.email, 200);
    const k = key(name, phone, email);
    if (seen.has(k)) { skipped++; continue; }
    seen.add(k);
    createContact({
      name, phone, email,
      company: str(c.company, 200),
      role: str(c.role, 200),
      notes: str(c.note, 5000),
      context: context && { ...context, whatTheyDo: str(c.role, 200) },
      category: b.category === "professional" ? "professional" : "acquaintance",
    });
    created++;
  }
  return json({ created, skipped });
}
