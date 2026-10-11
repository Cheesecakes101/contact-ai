"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api, timeAgo } from "@/components/api";
import { AskBox } from "@/components/AskBox";
import { ContactRow } from "@/components/ContactRow";
import { Avatar, Card, CategoryBadge, Empty, SectionTitle } from "@/components/ui";
import type { Contact, ReminderWithContact } from "@/lib/types";

interface FollowUps {
  due: ReminderWithContact[];
  upcoming: ReminderWithContact[];
  reconnect: { contactId: string; name: string; category: string; daysSince: number; cadenceDays: number; hint: string }[];
}

export default function Home() {
  const [contacts, setContacts] = useState<Contact[] | null>(null);
  const [fu, setFu] = useState<FollowUps | null>(null);
  const [aiOn, setAiOn] = useState(true);

  const load = useCallback(() => {
    api<{ contacts: Contact[] }>("/api/contacts").then((d) => setContacts(d.contacts));
    api<FollowUps>("/api/followups").then(setFu);
  }, []);

  useEffect(() => {
    load();
    api<{ ai: boolean }>("/api/status").then((s) => setAiOn(s.ai));
  }, [load]);

  async function markDone(id: string) {
    await api(`/api/reminders/${id}`, { method: "PATCH", json: { done: true } });
    load();
  }

  async function snooze(id: string) {
    await api(`/api/reminders/${id}`, { method: "PATCH", json: { snoozeDays: 7 } });
    load();
  }

  const hasFollowUps = fu && (fu.due.length || fu.upcoming.length);

  return (
    <div className="space-y-6">
      <div className="pt-2">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Your people</h1>
        <p className="mt-1 text-muted">Remember who they are, and how you can help each other.</p>
      </div>

      {!aiOn && (
        <p className="rounded-xl bg-warn-soft px-3 py-2 text-sm text-warn">
          AI is off — set <code>ANTHROPIC_API_KEY</code> to enable structuring, smart search and web enrichment. Basic
          keyword search still works.
        </p>
      )}

      <AskBox />

      {contacts && contacts.length === 0 && (
        <Empty title="Add your first person" href="/add" cta="+ Add a person">
          Import from your phone, then record a quick voice note about how you know them.
        </Empty>
      )}

      {hasFollowUps ? (
        <Card>
          <SectionTitle>Follow-ups</SectionTitle>
          <ul className="space-y-2">
            {[...fu!.due, ...fu!.upcoming].map((r) => {
              const overdue = new Date(r.dueAt) <= new Date();
              return (
                <li key={r.id} className={`flex items-center gap-3 rounded-xl p-2.5 ${overdue ? "bg-warn-soft" : ""}`}>
                  <button
                    onClick={() => markDone(r.id)}
                    aria-label="Mark done"
                    className="h-5 w-5 shrink-0 rounded-full border-2 border-accent hover:bg-accent-soft"
                  />
                  <Link href={`/contacts/${r.contactId}`} className="flex min-w-0 flex-1 items-center gap-3">
                    <Avatar name={r.contactName} size={32} />
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{r.contactName}</span>
                      <span className="block truncate text-sm text-muted">{r.note || "Reconnect"}</span>
                    </span>
                  </Link>
                  <span className={`shrink-0 text-xs ${overdue ? "font-medium text-warn" : "text-muted"}`}>{timeAgo(r.dueAt)}</span>
                  {overdue && (
                    <button onClick={() => snooze(r.id)} className="shrink-0 text-xs text-muted hover:text-ink">
                      +7d
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      ) : null}

      {fu && fu.reconnect.length > 0 && (
        <Card>
          <SectionTitle>Time to reconnect</SectionTitle>
          <ul className="space-y-1">
            {fu.reconnect.map((r) => (
              <li key={r.contactId}>
                <Link href={`/contacts/${r.contactId}`} className="flex items-start gap-3 rounded-xl p-2.5 hover:bg-accent-soft/60">
                  <Avatar name={r.name} size={36} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate font-medium">{r.name}</span>
                      <CategoryBadge category={r.category} />
                    </span>
                    <span className="block text-sm text-muted">
                      {r.daysSince} days since you last connected
                      {r.hint ? ` · ${r.hint}` : ""}
                    </span>
                  </span>
                  <span className="shrink-0 text-sm text-accent">
                    <span className="hidden sm:inline">Reach out </span>→
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {contacts && contacts.length > 0 && (
        <Card>
          <SectionTitle
            action={
              <Link href="/contacts" className="text-sm text-accent">
                All {contacts.length} →
              </Link>
            }
          >
            Recently updated
          </SectionTitle>
          <div className="-mx-2">
            {contacts.slice(0, 6).map((c) => (
              <ContactRow key={c.id} contact={c} />
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
