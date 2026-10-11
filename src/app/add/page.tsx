"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/components/api";
import { ContextEditor, EMPTY_CONTEXT } from "@/components/Context";
import { PhoneImport } from "@/components/PhoneImport";
import { Button, Card, ErrorNote } from "@/components/ui";
import { NEW_PERSON_PROMPTS, VoiceCapture } from "@/components/VoiceCapture";
import { CATEGORIES, type Category, type Contact, type StructuredContext } from "@/lib/types";
import type { VCardContact } from "@/lib/vcard";

type Step = "who" | "context" | "review";

interface Basics {
  name: string;
  phone: string;
  email: string;
  company: string;
  role: string;
}

export default function AddPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("who");
  const [basics, setBasics] = useState<Basics>({ name: "", phone: "", email: "", company: "", role: "" });
  const [importNote, setImportNote] = useState("");
  const [bulk, setBulk] = useState<VCardContact[] | null>(null);
  const [bulkResult, setBulkResult] = useState<{ created: number; skipped: number } | null>(null);
  const [text, setText] = useState("");
  const [category, setCategory] = useState<Category | null>(null);
  const [context, setContext] = useState<StructuredContext>(EMPTY_CONTEXT);
  const [followUp, setFollowUp] = useState<{ on: boolean; note: string; days: number }>({ on: false, note: "", days: 7 });
  const [enrich, setEnrich] = useState(true);
  const [aiOn, setAiOn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api<{ ai: boolean }>("/api/status").then((s) => {
      setAiOn(s.ai);
      if (!s.ai) setEnrich(false);
    });
  }, []);

  const set = (k: keyof Basics) => (e: React.ChangeEvent<HTMLInputElement>) => setBasics({ ...basics, [k]: e.target.value });

  async function organise() {
    setErr(null);
    if (!text.trim()) {
      setStep("review");
      return;
    }
    setBusy(true);
    try {
      const { result } = await api<{ result: StructuredContext & { company: string; role: string } }>("/api/structure", {
        json: { name: basics.name, text },
      });
      setContext({
        summary: result.summary,
        metWhere: result.metWhere,
        metHow: result.metHow,
        whatTheyDo: result.whatTheyDo,
        interests: result.interests,
        collaboration: result.collaboration,
        tags: result.tags,
      });
      setBasics((b) => ({ ...b, company: b.company || result.company, role: b.role || result.role }));
      if (!category && result.suggestedCategory) setCategory(result.suggestedCategory);
      if (result.followUp) setFollowUp({ on: true, note: result.followUp, days: 7 });
      setStep("review");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function save(withContext: boolean) {
    setErr(null);
    setBusy(true);
    try {
      const hasContext = withContext && Object.values(context).some((v) => (Array.isArray(v) ? v.length : v));
      const { contact } = await api<{ contact: Contact }>("/api/contacts", {
        json: {
          ...basics,
          category: category ?? "acquaintance",
          rawContext: text,
          context: hasContext ? context : null,
          notes: importNote,
        },
      });
      if (withContext && text.trim()) {
        await api(`/api/contacts/${contact.id}/interactions`, { json: { kind: "met", summary: context.summary || text.slice(0, 280) } });
      }
      if (withContext && followUp.on) {
        await api(`/api/contacts/${contact.id}/reminders`, { json: { days: followUp.days, note: followUp.note } });
      }
      router.push(`/contacts/${contact.id}${withContext && enrich ? "?enrich=1" : ""}`);
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  }

  async function bulkImport() {
    if (!bulk) return;
    setBusy(true);
    try {
      setBulkResult(await api("/api/contacts/import", { json: { contacts: bulk } }));
      setBulk(null);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const steps: { id: Step; label: string }[] = [
    { id: "who", label: "Who" },
    { id: "context", label: "Context" },
    { id: "review", label: "Review" },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Add a person</h1>
        <ol className="mt-3 flex gap-2 text-xs">
          {steps.map((s, i) => (
            <li
              key={s.id}
              className={`rounded-full px-3 py-1 ${
                s.id === step ? "bg-accent text-white" : steps.findIndex((x) => x.id === step) > i ? "bg-accent-soft text-accent" : "bg-card text-muted border border-line"
              }`}
            >
              {i + 1}. {s.label}
            </li>
          ))}
        </ol>
      </div>

      <ErrorNote message={err} />

      {step === "who" && (
        <>
          <Card>
            <p className="mb-3 text-sm font-medium">Import from your phone</p>
            <PhoneImport
              onOne={(c) => {
                setBasics({ name: c.name, phone: c.phone, email: c.email, company: c.company, role: c.role });
                setImportNote(c.note);
              }}
              onMany={(cs) => setBulk(cs)}
            />
            {bulk && (
              <div className="mt-4 rounded-xl bg-accent-soft p-3 text-sm">
                <p>
                  Found <b>{bulk.length}</b> contacts. Import them all? You can add context to each one later.
                </p>
                <div className="mt-2 flex gap-2">
                  <Button onClick={bulkImport} busy={busy}>
                    Import {bulk.length}
                  </Button>
                  <Button variant="ghost" onClick={() => setBulk(null)}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}
            {bulkResult && (
              <p className="mt-3 text-sm">
                ✓ Imported {bulkResult.created}
                {bulkResult.skipped ? `, skipped ${bulkResult.skipped} duplicates` : ""}.{" "}
                <Link href="/contacts" className="text-accent underline">
                  See everyone
                </Link>
              </p>
            )}
          </Card>

          <Card>
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                if (basics.name.trim()) setStep("context");
              }}
            >
              <div>
                <label className="mb-1 block text-xs font-medium text-muted">Name *</label>
                <input className="field" value={basics.name} onChange={set("name")} placeholder="Who did you meet?" autoFocus required />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted">Phone</label>
                  <input className="field" type="tel" value={basics.phone} onChange={set("phone")} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted">Email</label>
                  <input className="field" type="email" value={basics.email} onChange={set("email")} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted">Company</label>
                  <input className="field" value={basics.company} onChange={set("company")} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted">Role</label>
                  <input className="field" value={basics.role} onChange={set("role")} />
                </div>
              </div>
              <div className="flex justify-end pt-1">
                <Button type="submit" disabled={!basics.name.trim()}>
                  Next: add context →
                </Button>
              </div>
            </form>
          </Card>
        </>
      )}

      {step === "context" && (
        <>
          <Card>
            <p className="mb-1 text-sm text-muted">Tell me about</p>
            <p className="mb-4 text-xl font-semibold">{basics.name}</p>
            <VoiceCapture
              value={text}
              onChange={setText}
              prompts={NEW_PERSON_PROMPTS}
              placeholder="e.g. Met Priya at Night School demo day — she's a partner at a seed fund investing in consumer brands. Loves pottery and Hindi film music. She could intro me to jewellery founders; I could help her portfolio with growth marketing. Should send her our deck next week."
            />
          </Card>
          <Card>
            <p className="mb-2 text-sm font-medium">Relationship</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {CATEGORIES.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCategory(category === c.id ? null : c.id)}
                  className={`rounded-xl border px-3 py-2 text-sm ${category === c.id ? "border-accent bg-accent-soft text-accent" : "border-line"}`}
                >
                  {c.label}
                </button>
              ))}
            </div>
            {!category && aiOn && <p className="mt-2 text-xs text-muted">Leave blank and AI will suggest one.</p>}
          </Card>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button variant="ghost" onClick={() => setStep("who")}>
              ← Back
            </Button>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => save(false)} busy={busy && !text}>
                Skip & save
              </Button>
              <Button onClick={organise} busy={busy} disabled={!text.trim()}>
                {aiOn === false ? "Next →" : "✦ Organise with AI"}
              </Button>
            </div>
          </div>
        </>
      )}

      {step === "review" && (
        <>
          <Card>
            <div className="mb-4 flex items-center justify-between">
              <p className="text-xl font-semibold">{basics.name}</p>
              {aiOn && <span className="text-xs text-muted">✦ Structured by AI — edit anything</span>}
            </div>
            <ContextEditor value={context} onChange={setContext} />
          </Card>
          <Card className="space-y-4">
            <div>
              <p className="mb-2 text-sm font-medium">Relationship</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {CATEGORIES.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setCategory(c.id)}
                    className={`rounded-xl border px-3 py-2 text-sm ${category === c.id ? "border-accent bg-accent-soft text-accent" : "border-line"}`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
            <label className="flex items-start gap-3 text-sm">
              <input type="checkbox" className="mt-1" checked={followUp.on} onChange={(e) => setFollowUp({ ...followUp, on: e.target.checked })} />
              <span className="flex-1">
                Remind me in{" "}
                <select
                  className="rounded-md border border-line bg-card px-1"
                  value={followUp.days}
                  onChange={(e) => setFollowUp({ ...followUp, days: Number(e.target.value), on: true })}
                >
                  {[3, 7, 14, 30, 60, 90].map((d) => (
                    <option key={d} value={d}>
                      {d} days
                    </option>
                  ))}
                </select>
                <input
                  className="field mt-2 text-sm"
                  placeholder="What to follow up on (optional)"
                  value={followUp.note}
                  onChange={(e) => setFollowUp({ ...followUp, note: e.target.value, on: true })}
                />
              </span>
            </label>
            <label className={`flex items-start gap-3 text-sm ${aiOn ? "" : "opacity-50"}`}>
              <input type="checkbox" className="mt-1" checked={enrich} disabled={!aiOn} onChange={(e) => setEnrich(e.target.checked)} />
              <span>
                Light web search to enrich their profile (LinkedIn, company, role, mentions).
                <span className="block text-xs text-muted">Results are labelled AI-estimated &amp; unverified.</span>
              </span>
            </label>
          </Card>
          <div className="flex justify-between">
            <Button variant="ghost" onClick={() => setStep("context")}>
              ← Back
            </Button>
            <Button onClick={() => save(true)} busy={busy}>
              Save {basics.name.split(" ")[0]}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
