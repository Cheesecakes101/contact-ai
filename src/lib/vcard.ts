// Minimal vCard 3.0 reader/writer. Works in both browser and server.

export interface VCardContact {
  name: string;
  phone: string;
  email: string;
  company: string;
  role: string;
  note: string;
  urls: string[];
}

function escape(v: string): string {
  return v.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

function unescape(v: string): string {
  return v.replace(/\\n/gi, "\n").replace(/\\([,;\\])/g, "$1");
}

/** Fold lines longer than 75 octets per RFC 6350. */
function fold(line: string): string {
  if (line.length <= 75) return line;
  const parts: string[] = [];
  for (let i = 0; i < line.length; i += 74) parts.push((i === 0 ? "" : " ") + line.slice(i, i + 74));
  return parts.join("\r\n");
}

export function toVCard(c: Partial<VCardContact> & { name: string }): string {
  const name = c.name.trim();
  const [first, ...rest] = name.split(/\s+/);
  const last = rest.join(" ");
  const lines = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `FN:${escape(name)}`,
    `N:${escape(last)};${escape(first ?? "")};;;`,
  ];
  if (c.phone) lines.push(`TEL;TYPE=CELL:${escape(c.phone)}`);
  if (c.email) lines.push(`EMAIL;TYPE=INTERNET:${escape(c.email)}`);
  if (c.company) lines.push(`ORG:${escape(c.company)}`);
  if (c.role) lines.push(`TITLE:${escape(c.role)}`);
  for (const url of c.urls ?? []) if (url) lines.push(`URL:${escape(url)}`);
  if (c.note) lines.push(`NOTE:${escape(c.note)}`);
  lines.push("END:VCARD");
  return lines.map(fold).join("\r\n");
}

export function toVCardFile(contacts: (Partial<VCardContact> & { name: string })[]): string {
  return contacts.map(toVCard).join("\r\n") + "\r\n";
}

export function parseVCards(text: string): VCardContact[] {
  // Unfold continuation lines first.
  const unfolded = text.replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "");
  const out: VCardContact[] = [];
  let cur: VCardContact | null = null;
  let structuredName = "";
  for (const raw of unfolded.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const upper = line.toUpperCase();
    if (upper === "BEGIN:VCARD") {
      cur = { name: "", phone: "", email: "", company: "", role: "", note: "", urls: [] };
      structuredName = "";
      continue;
    }
    if (upper === "END:VCARD") {
      if (cur) {
        if (!cur.name && structuredName) cur.name = structuredName;
        if (cur.name || cur.phone || cur.email) out.push({ ...cur, name: cur.name || cur.phone || cur.email });
      }
      cur = null;
      continue;
    }
    if (!cur) continue;
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    // Strip "item1." grouping prefixes and parameters.
    const key = line.slice(0, idx).split(";")[0].replace(/^item\d+\./i, "").toUpperCase();
    const value = unescape(line.slice(idx + 1));
    switch (key) {
      case "FN":
        cur.name = value.trim();
        break;
      case "N": {
        const [last, first, middle] = value.split(";");
        structuredName = [first, middle, last].filter(Boolean).join(" ").trim();
        break;
      }
      case "TEL":
        if (!cur.phone) cur.phone = value.trim();
        break;
      case "EMAIL":
        if (!cur.email) cur.email = value.trim();
        break;
      case "ORG":
        cur.company = value.split(";")[0].trim();
        break;
      case "TITLE":
        cur.role = value.trim();
        break;
      case "NOTE":
        cur.note = value.trim();
        break;
      case "URL":
        cur.urls.push(value.trim());
        break;
    }
  }
  return out;
}
