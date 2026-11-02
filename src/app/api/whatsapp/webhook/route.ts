import { structureContext } from "@/lib/ai";
import { addInteraction, createContact, findContactByName, updateContact } from "@/lib/db";
import { extractMessages, isOwnerNumber, sendWhatsAppText, verifyWebhookSignature, type IncomingWhatsAppMessage } from "@/lib/whatsapp";
import type { StructuredContext } from "@/lib/types";

export const dynamic = "force-dynamic";

// --- Meta's one-time webhook verification handshake -----------------------
export function GET(req: Request) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN && challenge) {
    return new Response(challenge, { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

// --- Incoming messages ------------------------------------------------------
// Expected format (first line is the person's name, rest is the note):
//
//   Priya Shah
//   Caught up over coffee, she's raising a new fund.
//
// Matches an existing contact by name, or creates a new one, then runs the
// same AI structuring used by the web app's "Log a catch-up" box.
export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifyWebhookSignature(raw, req.headers.get("x-hub-signature-256"))) {
    return new Response("Invalid signature", { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return new Response("OK", { status: 200 });
  }

  // Always 200 quickly so Meta doesn't retry; do the real work, log failures.
  for (const msg of extractMessages(payload)) {
    handleMessage(msg).catch((e) => console.error("whatsapp message handling failed", e));
  }
  return new Response("OK", { status: 200 });
}

async function handleMessage(msg: IncomingWhatsAppMessage) {
  if (!isOwnerNumber(msg.from)) {
    console.warn("Ignored WhatsApp message from non-owner number", msg.from);
    return;
  }

  if (msg.type === "audio") {
    await sendWhatsAppText(msg.from, "Voice notes aren't supported yet — send a text instead, first line the person's name.");
    return;
  }

  const body = msg.text?.body?.trim();
  if (!body) {
    await sendWhatsAppText(msg.from, "Send a message with the person's name on the first line, then what happened.");
    return;
  }

  const [firstLine, ...rest] = body.split(/\r?\n/);
  const name = firstLine.trim();
  const note = rest.join("\n").trim();

  if (!name) {
    await sendWhatsAppText(msg.from, "Couldn't find a name — put the person's name on the first line.");
    return;
  }

  const existing = findContactByName(name);

  if (!existing) {
    const structured = note ? await structureContext({ name, text: note }) : null;
    const contact = createContact({
      name,
      rawContext: note,
      context: structured as StructuredContext | null,
      category: structured?.suggestedCategory || "acquaintance",
      company: structured?.company,
      role: structured?.role,
    });
    if (note) await addInteraction(contact.id, new Date().toISOString(), "note", note);
    await sendWhatsAppText(msg.from, `✅ Added ${contact.name} as a new contact.`);
    return;
  }

  if (note) {
    await addInteraction(existing.id, new Date().toISOString(), "note", note);
    const structured = await structureContext({ name: existing.name, text: note, existing: existing.context });
    updateContact(existing.id, {
      context: structured,
      rawContext: [existing.rawContext, note].filter(Boolean).join("\n\n"),
      company: existing.company || structured.company,
      role: existing.role || structured.role,
    });
    await sendWhatsAppText(msg.from, `✅ Updated ${existing.name}: logged "${note.slice(0, 80)}".`);
  } else {
    await sendWhatsAppText(msg.from, `Found ${existing.name} but no note to log — add a line about what happened.`);
  }
}
