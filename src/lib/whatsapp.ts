import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

const GRAPH_VERSION = "v22.0";

export function whatsappEnabled(): boolean {
  return Boolean(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
}

/** Normalise to digits-only so "+1 (415) 555-0134" matches WhatsApp's "14155550134". */
export function normalizePhone(v: string): string {
  return v.replace(/[^\d]/g, "");
}

export function isOwnerNumber(from: string): boolean {
  const owner = process.env.OWNER_WHATSAPP_NUMBER;
  if (!owner) return true; // no allowlist configured — anyone who has the number can message the bot
  return normalizePhone(from) === normalizePhone(owner);
}

/** Verifies Meta's X-Hub-Signature-256 header against the raw request body. */
export function verifyWebhookSignature(rawBody: string, signatureHeader: string | null): boolean {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret) return true; // signature check skipped when no app secret is configured
  if (!signatureHeader?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  const given = signatureHeader.slice(7);
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(given, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function sendWhatsAppText(to: string, text: string): Promise<void> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneNumberId) throw new Error("WhatsApp is not configured.");
  const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: normalizePhone(to),
      type: "text",
      text: { body: text.slice(0, 4096) },
    }),
  });
  if (!res.ok) console.error("WhatsApp send failed", res.status, await res.text().catch(() => ""));
}

/** Downloads a WhatsApp media item (e.g. a voice note) as a Buffer + its mime type. */
export async function downloadWhatsAppMedia(mediaId: string): Promise<{ buffer: Buffer; mimeType: string } | null> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!token) return null;
  const meta = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${mediaId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!meta.ok) return null;
  const { url, mime_type } = (await meta.json()) as { url?: string; mime_type?: string };
  if (!url) return null;
  const file = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!file.ok) return null;
  return { buffer: Buffer.from(await file.arrayBuffer()), mimeType: mime_type ?? "application/octet-stream" };
}

// ---------------------------------------------------------------------------
// Incoming webhook payload shape (the subset we read)
// ---------------------------------------------------------------------------

export interface IncomingWhatsAppMessage {
  from: string;
  type: string;
  text?: { body: string };
  audio?: { id: string; mime_type: string };
}

export function extractMessages(payload: unknown): IncomingWhatsAppMessage[] {
  const out: IncomingWhatsAppMessage[] = [];
  const entries = (payload as { entry?: unknown[] })?.entry ?? [];
  for (const entry of entries) {
    const changes = (entry as { changes?: unknown[] })?.changes ?? [];
    for (const change of changes) {
      const messages = (change as { value?: { messages?: IncomingWhatsAppMessage[] } })?.value?.messages ?? [];
      out.push(...messages);
    }
  }
  return out;
}
