"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { api, formatDate, timeAgo } from "@/components/api";
import { ContextEditor, ContextView, EMPTY_CONTEXT } from "@/components/Context";
import { Avatar, Button, Card, CategoryBadge, ErrorNote, SectionTitle, UnverifiedBadge } from "@/components/ui";
import { UPDATE_PROMPTS, VoiceCapture } from "@/components/VoiceCapture";
import { CATEGORIES, type Contact, type Interaction, type Reminder, type StructuredContext } from "@/lib/types";

const KINDS = [
  { id: "coffee", label: "☕ Coffee" },
  { id: "call", label: "📞 Call" },
  { id: "message", label: "💬 Message" },
  { id: "event", label: "🎟 Event" },
  { id: "meeting", label: "🤝 Meeting" },
  { id: "met", label: "👋 First met" },
  { id: "note", label: "📝 Note" },
];
const kindLabel = (k: string) => KINDS.find((x) => x.id === k)?.label ?? k;

/** Remove the "[Question?] " labels the guided voice note adds. */
const stripPrompts = (t: string) => t.replace(/\[[^\]]+\]\s*/g, "").replace(/\n{2,}/g, "\n").trim();

interface Data {
  contact: Contact;
  interactions: Interaction[];
  reminders: Reminder[];
}

export default function ContactPage() {
  return (
    <Suspense>
      <ContactProfile />
    </Suspense>
  );
}

function ContactProfile() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const search = useSearchParams();
  const [data, setData] = useState<Data | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [aiOn, setAiOn] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await api<Data>(`/api/contacts/${id}`));
    } catch {
      setNotFound(true);
    }
  }, [id]);

  useEffect(() => {
    load();
    api<{ ai: boolean }>("/api/status").then((s) => setAiOn(s.ai));
  }, [load]);

  const patch = async (body: Partial<Contact>) => {
    const { contact } = await api<{ contact: Contact }>(`/api/contacts/${id}`, { method: "PATCH", json: body });
    setData((d) => (d ? { ...d, contact } : d));
  };

  if (notFound)
    return (
      <p className="text-muted">
        Contact not found. <Link href="/contacts" className="text-accent underline">Back to people</Link>
      </p>
    );
  if (!data) return <p className="text-muted">Loading…</p>;
  const { contact: c } = data;

  return (
    <div className="space-y-4">
      <Header contact={c} onPatch={patch} />
      <ErrorNote message={err} />
      <ContextSection contact={c} onPatch={patch} />
      <CatchUp contact={c} aiOn={aiOn} reload={load} onError={setErr} />
      <Reminders contactId={id} reminders={data.reminders} reload={load} />
      <WebProfile contact={c} aiOn={aiOn} autoStart={search.get("enrich") === "1"} onPatch={patch} setData={setData} />
      <Reconnect contact={c} aiOn={aiOn} />
      <History interactions={data.interactions} reload={load} />
      <Notes contact={c} onPatch={patch} />
      <div className="pt-4 text-center">
        <Button
          variant="danger"
          onClick={async () => {
            if (!confirm(`Delete ${c.name}? This can't be undone.`)) return;
            await api(`/api/contacts/${id}`, { method: "DELETE" });
            router.push("/contacts");
          }}
        >
          Delete contact
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function Header({ contact: c, onPatch }: { contact: Contact; onPatch: (b: Partial<Contact>) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: c.name, phone: c.phone, email: c.email, company: c.company, role: c.role });
  useEffect(() => setForm({ name: c.name, phone: c.phone, email: c.email, company: c.company, role: c.role }), [c]);

  if (editing)
    return (
      <Card>
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            await onPatch(form);
            setEditing(false);
          }}
        >
          {(["name", "phone", "email", "company", "role"] as const).map((k) => (
            <div key={k}>
              <label className="mb-1 block text-xs font-medium capitalize text-muted">{k}</label>
              <input className="field" value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} required={k === "name"} />
            </div>
          ))}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
            <Button type="submit">Save</Button>
          </div>
        </form>
      </Card>
    );

  const subtitle = [c.role, c.company].filter(Boolean).join(" · ");
  return (
    <Card>
      <div className="flex items-start gap-4">
        <Avatar name={c.name} size={60} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h1 className="text-2xl font-semibold leading-tight tracking-tight">{c.name}</h1>
            <button onClick={() => setEditing(true)} className="text-sm text-muted hover:text-ink">
              Edit
            </button>
          </div>
          {subtitle && <p className="text-muted">{subtitle}</p>}
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
            <select
              value={c.category}
              onChange={(e) => onPatch({ category: e.target.value as Contact["category"] })}
              className="rounded-full border border-line bg-card px-2 py-0.5"
              aria-label="Relationship"
            >
              {CATEGORIES.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.label}
                </option>
              ))}
            </select>
            <span>Last interaction: {timeAgo(c.lastInteractionAt)}</span>
          </div>
        </div>
      </div>
      {(c.phone || c.email) && (
        <div className="mt-4 flex flex-wrap gap-2">
          {c.phone && (
            <>
              <a href={`tel:${c.phone}`} className="rounded-xl border border-line px-3 py-1.5 text-sm">
                📞 Call
              </a>
              <a href={`sms:${c.phone}`} className="rounded-xl border border-line px-3 py-1.5 text-sm">
                💬 Text
              </a>
              <a href={`https://wa.me/${c.phone.replace(/[^\d]/g, "")}`} target="_blank" rel="noreferrer" className="rounded-xl border border-line px-3 py-1.5 text-sm">
                WhatsApp
              </a>
            </>
          )}
          {c.email && (
            <a href={`mailto:${c.email}`} className="rounded-xl border border-line px-3 py-1.5 text-sm">
              ✉️ Email
            </a>
          )}
        </div>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------

function Reminders({ contactId, reminders, reload }: { contactId: string; reminders: Reminder[]; reload: () => void }) {
  const [custom, setCustom] = useState("");
  const [note, setNote] = useState("");
  const open = reminders.filter((r) => !r.done);

  async function remind(body: { days?: number; dueAt?: string }) {
    await api(`/api/contacts/${contactId}/reminders`, { json: { ...body, note } });
    setNote("");
    setCustom("");
    reload();
  }

  return (
    <Card>
      <SectionTitle>Follow-up</SectionTitle>
      {open.length > 0 && (
        <ul className="mb-4 space-y-2">
          {open.map((r) => {
            const overdue = new Date(r.dueAt) <= new Date();
            return (
              <li key={r.id} className={`flex items-center gap-3 rounded-xl p-3 text-sm ${overdue ? "bg-warn-soft" : "bg-paper"}`}>
                <button
                  className="h-5 w-5 shrink-0 rounded-full border-2 border-accent"
                  aria-label="Mark done"
                  onClick={async () => {
                    await api(`/api/reminders/${r.id}`, { method: "PATCH", json: { done: true } });
                    reload();
                  }}
                />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{r.note || "Reconnect"}</p>
                  <p className={`text-xs ${overdue ? "text-warn" : "text-muted"}`}>
                    Due {timeAgo(r.dueAt)} · {formatDate(r.dueAt)}
                  </p>
                </div>
                <button
                  className="text-xs text-muted hover:text-ink"
                  onClick={async () => {
                    await api(`/api/reminders/${r.id}`, { method: "PATCH", json: { snoozeDays: 7 } });
                    reload();
                  }}
                >
                  Snooze 7d
                </button>
                <button
                  className="text-muted hover:text-ink"
                  aria-label="Delete reminder"
                  onClick={async () => {
                    await api(`/api/reminders/${r.id}`, { method: "DELETE" });
                    reload();
                  }}
                >
                  ×
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <input className="field mb-2 text-sm" placeholder="What about? (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted">Remind me in</span>
        {[7, 30, 90].map((d) => (
          <Button key={d} variant="secondary" className="!px-3 !py-1.5" onClick={() => remind({ days: d })}>
            {d} days
          </Button>
        ))}
        <input type="date" className="field !w-auto !py-1.5 text-sm" value={custom} onChange={(e) => setCustom(e.target.value)} />
        {custom && (
          <Button className="!px-3 !py-1.5" onClick={() => remind({ dueAt: new Date(`${custom}T09:00:00`).toISOString() })}>
            Set
          </Button>
        )}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------

function CatchUp({
  contact,
  aiOn,
  reload,
  onError,
}: {
  contact: Contact;
  aiOn: boolean;
  reload: () => void;
  onError: (e: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [kind, setKind] = useState("coffee");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);

  async function save() {
    onError(null);
    setBusy(true);
    try {
      await api(`/api/contacts/${contact.id}/interactions`, {
        json: { kind, date: new Date(`${date}T12:00:00`).toISOString(), summary: stripPrompts(text) },
      });
      if (text.trim() && aiOn) {
        // Fold anything new into the structured context.
        const { result } = await api<{ result: StructuredContext & { company: string; role: string } }>("/api/structure", {
          json: { name: contact.name, text, existing: contact.context },
        });
        await api(`/api/contacts/${contact.id}`, {
          method: "PATCH",
          json: {
            context: {
              summary: result.summary,
              metWhere: result.metWhere,
              metHow: result.metHow,
              whatTheyDo: result.whatTheyDo,
              interests: result.interests,
              collaboration: result.collaboration,
              tags: result.tags,
            },
            rawContext: [contact.rawContext, `(${date}) ${text}`].filter(Boolean).join("\n\n"),
            company: contact.company || result.company,
            role: contact.role || result.role,
          },
        });
        if (result.followUp) {
          await api(`/api/contacts/${contact.id}/reminders`, { json: { days: 7, note: result.followUp } });
        }
      }
      setText("");
      setOpen(false);
      reload();
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!open)
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-3 rounded-2xl border border-dashed border-accent/50 bg-accent-soft/50 p-4 text-left"
      >
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent text-white">🎙</span>
        <span>
          <span className="block font-medium">Log a catch-up</span>
          <span className="text-sm text-muted">Voice note or text — AI updates their profile.</span>
        </span>
      </button>
    );

  return (
    <Card className="space-y-4">
      <SectionTitle>Log a catch-up</SectionTitle>
      <div className="flex flex-wrap gap-2">
        {KINDS.filter((k) => k.id !== "met").map((k) => (
          <button
            key={k.id}
            onClick={() => setKind(k.id)}
            className={`rounded-full border px-3 py-1 text-sm ${kind === k.id ? "border-accent bg-accent-soft text-accent" : "border-line"}`}
          >
            {k.label}
          </button>
        ))}
        <input type="date" className="field !w-auto !py-1 text-sm" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>
      <VoiceCapture value={text} onChange={setText} prompts={UPDATE_PROMPTS} placeholder="What happened? What's new with them?" />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
        <Button onClick={save} busy={busy}>
          {aiOn && text.trim() ? "✦ Save & update profile" : "Save"}
        </Button>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------

function ContextSection({ contact, onPatch }: { contact: Contact; onPatch: (b: Partial<Contact>) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<StructuredContext>(contact.context ?? EMPTY_CONTEXT);
  useEffect(() => setDraft(contact.context ?? EMPTY_CONTEXT), [contact.context]);

  return (
    <Card>
      <SectionTitle
        action={
          !editing && (
            <button onClick={() => setEditing(true)} className="text-sm text-muted hover:text-ink">
              Edit
            </button>
          )
        }
      >
        Context
      </SectionTitle>
      {editing ? (
        <>
          <ContextEditor value={draft} onChange={setDraft} />
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
            <Button
              onClick={async () => {
                await onPatch({ context: draft });
                setEditing(false);
              }}
            >
              Save
            </Button>
          </div>
        </>
      ) : contact.context ? (
        <ContextView context={contact.context} />
      ) : (
        <p className="text-sm text-muted">
          No context yet. Log a catch-up above with a quick voice note — where you met, what they do, how you can help each
          other.
          {contact.rawContext && <span className="mt-2 block whitespace-pre-wrap text-ink">{contact.rawContext}</span>}
        </p>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------

function WebProfile({
  contact,
  aiOn,
  autoStart,
  onPatch,
  setData,
}: {
  contact: Contact;
  aiOn: boolean;
  autoStart: boolean;
  onPatch: (b: Partial<Contact>) => Promise<void>;
  setData: React.Dispatch<React.SetStateAction<Data | null>>;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const started = useRef(false);
  const e = contact.enrichment;

  const run = useCallback(async () => {
    setErr(null);
    setBusy(true);
    try {
      const { contact: updated } = await api<{ contact: Contact }>(`/api/contacts/${contact.id}/enrich`, { method: "POST" });
      setData((d) => (d ? { ...d, contact: updated } : d));
    } catch (x) {
      setErr((x as Error).message);
    } finally {
      setBusy(false);
    }
  }, [contact.id, setData]);

  useEffect(() => {
    if (autoStart && aiOn && !started.current && !contact.enrichment) {
      started.current = true;
      window.history.replaceState(null, "", `/contacts/${contact.id}`);
      run();
    }
  }, [autoStart, aiOn, contact.enrichment, contact.id, run]);

  if (!aiOn && !e) return null;

  return (
    <Card className="border-warn/30">
      <SectionTitle action={<UnverifiedBadge />}>From the web</SectionTitle>
      {busy && (
        <p className="flex items-center gap-2 text-sm text-muted">
          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          Searching the public web for {contact.name}…
        </p>
      )}
      {err && <p className="text-sm text-red-600">{err}</p>}
      {!busy && !e && (
        <div className="text-sm">
          <p className="text-muted">Run a light public search for LinkedIn, company, role and mentions.</p>
          <Button variant="secondary" className="mt-3" onClick={run}>
            🔎 Search the web
          </Button>
        </div>
      )}
      {!busy && e && (
        <div className="space-y-3 text-sm">
          <p className="text-xs text-muted">
            Found automatically and may be about someone else with the same name. Confidence: <b>{e.confidence}</b> ·{" "}
            {timeAgo(e.fetchedAt)}
          </p>
          {e.summary && <p className="leading-relaxed">{e.summary}</p>}
          <dl className="grid gap-2 sm:grid-cols-2">
            {e.role && (
              <div>
                <dt className="text-xs text-muted">Role (est.)</dt>
                <dd>{e.role}</dd>
              </div>
            )}
            {e.company && (
              <div>
                <dt className="text-xs text-muted">Company (est.)</dt>
                <dd>{e.company}</dd>
              </div>
            )}
            {e.location && (
              <div>
                <dt className="text-xs text-muted">Location (est.)</dt>
                <dd>{e.location}</dd>
              </div>
            )}
            {e.linkedin && (
              <div>
                <dt className="text-xs text-muted">LinkedIn (est.)</dt>
                <dd>
                  <a href={e.linkedin} target="_blank" rel="noreferrer" className="break-all text-accent underline">
                    {e.linkedin.replace(/^https?:\/\/(www\.)?/, "")}
                  </a>
                </dd>
              </div>
            )}
          </dl>
          {e.mentions.length > 0 && (
            <div>
              <p className="text-xs text-muted">Public mentions</p>
              <ul className="mt-1 space-y-1">
                {e.mentions.map((m, i) => (
                  <li key={i}>
                    <a href={m.url} target="_blank" rel="noreferrer" className="text-accent underline">
                      {m.title || m.url}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {e.sources.length > 0 && (
            <details className="text-xs text-muted">
              <summary className="cursor-pointer">Sources ({e.sources.length})</summary>
              <ul className="mt-1 space-y-0.5">
                {e.sources.map((s) => (
                  <li key={s} className="truncate">
                    <a href={s} target="_blank" rel="noreferrer" className="underline">
                      {s}
                    </a>
                  </li>
                ))}
              </ul>
            </details>
          )}
          <div className="flex flex-wrap gap-2 pt-1">
            {(e.role || e.company) && (e.role !== contact.role || e.company !== contact.company) && (
              <Button
                variant="secondary"
                className="!py-1.5"
                onClick={() => onPatch({ role: contact.role || e.role, company: contact.company || e.company })}
              >
                ✓ Looks right — use role &amp; company
              </Button>
            )}
            {aiOn && (
              <Button variant="ghost" className="!py-1.5" onClick={run}>
                Refresh
              </Button>
            )}
            <Button
              variant="ghost"
              className="!py-1.5"
              onClick={async () => {
                const { contact: updated } = await api<{ contact: Contact }>(`/api/contacts/${contact.id}/enrich`, { method: "DELETE" });
                setData((d) => (d ? { ...d, contact: updated } : d));
              }}
            >
              Wrong person — remove
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------

function Reconnect({ contact, aiOn }: { contact: Contact; aiOn: boolean }) {
  const [draft, setDraft] = useState<{ why: string; message: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  if (!aiOn) return null;
  return (
    <Card>
      <SectionTitle>Reconnect</SectionTitle>
      {!draft ? (
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted">Get an AI-drafted message based on what you know about {contact.name.split(" ")[0]}.</p>
          <Button
            variant="secondary"
            busy={busy}
            onClick={async () => {
              setBusy(true);
              setErr(null);
              try {
                setDraft(await api(`/api/contacts/${contact.id}/reconnect`, { method: "POST" }));
              } catch (e) {
                setErr((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            ✦ Draft
          </Button>
        </div>
      ) : (
        <div className="space-y-3 text-sm">
          <p className="text-muted">{draft.why}</p>
          <textarea className="field min-h-24" value={draft.message} onChange={(e) => setDraft({ ...draft, message: e.target.value })} />
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={async () => {
                await navigator.clipboard.writeText(draft.message);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
            >
              {copied ? "Copied ✓" : "Copy"}
            </Button>
            {contact.phone && (
              <a className="rounded-xl border border-line px-4 py-2.5 text-sm" href={`sms:${contact.phone}?&body=${encodeURIComponent(draft.message)}`}>
                Send as text
              </a>
            )}
            <Button variant="ghost" onClick={() => setDraft(null)}>
              Discard
            </Button>
          </div>
        </div>
      )}
      {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
    </Card>
  );
}

// ---------------------------------------------------------------------------

function History({ interactions, reload }: { interactions: Interaction[]; reload: () => void }) {
  return (
    <Card>
      <SectionTitle>Interaction history</SectionTitle>
      {interactions.length === 0 ? (
        <p className="text-sm text-muted">Nothing logged yet.</p>
      ) : (
        <ol className="relative space-y-4 border-l border-line pl-5">
          {interactions.map((i) => (
            <li key={i.id} className="group relative">
              <span className="absolute -left-[25px] top-1.5 h-2.5 w-2.5 rounded-full bg-accent" />
              <div className="flex items-center gap-2 text-xs text-muted">
                <span>{formatDate(i.date)}</span>
                <span>·</span>
                <span>{kindLabel(i.kind)}</span>
                <button
                  className="ml-auto opacity-0 transition group-hover:opacity-100"
                  onClick={async () => {
                    if (!confirm("Delete this entry?")) return;
                    await api(`/api/interactions/${i.id}`, { method: "DELETE" });
                    reload();
                  }}
                >
                  Delete
                </button>
              </div>
              {i.summary && <p className="mt-0.5 whitespace-pre-wrap text-sm">{i.summary}</p>}
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

function Notes({ contact, onPatch }: { contact: Contact; onPatch: (b: Partial<Contact>) => Promise<void> }) {
  const [notes, setNotes] = useState(contact.notes);
  const [saved, setSaved] = useState(false);
  useEffect(() => setNotes(contact.notes), [contact.notes]);
  return (
    <Card>
      <SectionTitle action={saved && <span className="text-xs text-muted">Saved</span>}>Notes</SectionTitle>
      <textarea
        className="field min-h-28 text-sm"
        placeholder="Kids' names, coffee order, gift ideas…"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        onBlur={async () => {
          if (notes === contact.notes) return;
          await onPatch({ notes });
          setSaved(true);
          setTimeout(() => setSaved(false), 1500);
        }}
      />
    </Card>
  );
}
