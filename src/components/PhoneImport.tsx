"use client";

import { useEffect, useRef, useState } from "react";
import { parseVCards, type VCardContact } from "@/lib/vcard";
import { Button } from "./ui";

interface PickerContact {
  name?: string[];
  tel?: string[];
  email?: string[];
}
type ContactsManager = { select(props: string[], opts: { multiple: boolean }): Promise<PickerContact[]> };

function picker(): ContactsManager | null {
  if (typeof navigator === "undefined") return null;
  const n = navigator as unknown as { contacts?: ContactsManager };
  return n.contacts && "select" in n.contacts ? n.contacts : null;
}

/**
 * Import from the phone. Uses the Contact Picker API where available (Android Chrome),
 * and a .vcf upload everywhere else (iPhone: Contacts → select → Share → save vCard).
 * One contact → prefill the form. Many → hand back for bulk import.
 */
export function PhoneImport({
  onOne,
  onMany,
}: {
  onOne: (c: VCardContact) => void;
  onMany: (cs: VCardContact[]) => void;
}) {
  const [hasPicker, setHasPicker] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => setHasPicker(!!picker()), []);

  function deliver(list: VCardContact[]) {
    if (list.length === 0) setErr("No contacts found in that selection.");
    else if (list.length === 1) onOne(list[0]);
    else onMany(list);
  }

  async function pick() {
    setErr(null);
    try {
      const selected = await picker()!.select(["name", "tel", "email"], { multiple: true });
      deliver(
        selected
          .map((c) => ({
            name: c.name?.[0] ?? "",
            phone: c.tel?.[0] ?? "",
            email: c.email?.[0] ?? "",
            company: "",
            role: "",
            note: "",
            urls: [],
          }))
          .filter((c) => c.name || c.phone || c.email)
          .map((c) => ({ ...c, name: c.name || c.phone || c.email })),
      );
    } catch {
      /* user cancelled */
    }
  }

  async function onFile(file: File) {
    setErr(null);
    deliver(parseVCards(await file.text()));
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {hasPicker && (
          <Button type="button" variant="secondary" onClick={pick}>
            📱 Pick from phone contacts
          </Button>
        )}
        <Button type="button" variant="secondary" onClick={() => fileRef.current?.click()}>
          📇 Import .vcf file
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept=".vcf,text/vcard,text/x-vcard"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
            e.target.value = "";
          }}
        />
      </div>
      {!hasPicker && (
        <p className="text-xs text-muted">
          On iPhone: open Contacts, tap a contact → Share Contact → Save to Files, then import the .vcf here. Select
          several contacts (or a whole list) to bulk-import.
        </p>
      )}
      {err && <p className="text-sm text-red-600">{err}</p>}
    </div>
  );
}
