"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/components/api";
import { ContactRow } from "@/components/ContactRow";
import { Card, Empty } from "@/components/ui";
import { CATEGORIES, type Contact } from "@/lib/types";

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[] | null>(null);
  const [filter, setFilter] = useState<string>("all");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<"recent" | "name" | "stale">("recent");

  useEffect(() => {
    api<{ contacts: Contact[] }>("/api/contacts").then((d) => setContacts(d.contacts));
  }, []);

  const shown = useMemo(() => {
    if (!contacts) return [];
    const needle = q.trim().toLowerCase();
    const list = contacts.filter(
      (c) =>
        (filter === "all" || c.category === filter) &&
        (!needle || JSON.stringify([c.name, c.company, c.role, c.context?.tags, c.context?.metWhere]).toLowerCase().includes(needle)),
    );
    const last = (c: Contact) => new Date(c.lastInteractionAt ?? c.createdAt).getTime();
    if (sort === "name") list.sort((a, b) => a.name.localeCompare(b.name));
    if (sort === "stale") list.sort((a, b) => last(a) - last(b));
    return list;
  }, [contacts, filter, q, sort]);

  const counts = useMemo(() => {
    const m: Record<string, number> = { all: contacts?.length ?? 0 };
    for (const c of contacts ?? []) m[c.category] = (m[c.category] ?? 0) + 1;
    return m;
  }, [contacts]);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">People</h1>
      <div className="flex gap-2">
        <input className="field" placeholder="Filter by name, company, tag…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="field !w-auto" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} aria-label="Sort">
          <option value="recent">Recent</option>
          <option value="name">A–Z</option>
          <option value="stale">Longest no contact</option>
        </select>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1 text-sm [scrollbar-width:none]">
        {[{ id: "all", label: "All" }, ...CATEGORIES].map((c) => (
          <button
            key={c.id}
            onClick={() => setFilter(c.id)}
            className={`shrink-0 rounded-full border px-3 py-1 ${filter === c.id ? "border-accent bg-accent-soft text-accent" : "border-line bg-card"}`}
          >
            {c.label} <span className="text-muted">{counts[c.id] ?? 0}</span>
          </button>
        ))}
      </div>
      {contacts === null ? (
        <p className="text-muted">Loading…</p>
      ) : contacts.length === 0 ? (
        <Empty title="No one here yet" href="/add" cta="+ Add a person" />
      ) : (
        <Card className="!p-2">
          {shown.length === 0 ? <p className="p-4 text-sm text-muted">No matches.</p> : shown.map((c) => <ContactRow key={c.id} contact={c} />)}
        </Card>
      )}
    </div>
  );
}
