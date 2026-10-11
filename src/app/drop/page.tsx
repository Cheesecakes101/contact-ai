"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/components/api";
import { Button, Card, ErrorNote } from "@/components/ui";

const STEPS = [
  {
    title: "Create a Room",
    body: "As a host, generate a random room code or URL in seconds. Share it with your attendees on-screen or in chat.",
  },
  {
    title: "Attendees Add Info",
    body: "Everyone enters their name, phone, profession, and optional social links. No account registration needed.",
  },
  {
    title: "Export and Import",
    body: "Once closed, download contacts.vcf instantly. Android or iOS will ask to import all cards with one tap.",
  },
];

export default function DropLanding() {
  const router = useRouter();
  const [mode, setMode] = useState<"create" | "join" | null>(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function create() {
    setBusy(true);
    setErr(null);
    try {
      const { room, hostToken } = await api<{ room: { code: string }; hostToken: string }>("/api/rooms", { json: { name } });
      try {
        localStorage.setItem(`drop-host-${room.code}`, hostToken);
      } catch {
        /* private mode */
      }
      router.push(`/drop/${room.code}`);
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="pt-2 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Contact Drop</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Frictionless Sharing</h1>
        <p className="mx-auto mt-2 max-w-md text-lg text-muted">Instantly swap contacts with everyone in the room.</p>
        <p className="mx-auto mt-3 max-w-lg text-sm text-muted">
          Skip manual exchanges. Join a shared event room, add your card, and download a single contact file for everyone
          when the host closes the session.
        </p>
        <div className="mt-5 flex justify-center gap-3">
          <Button onClick={() => setMode("create")} className={mode === "create" ? "ring-2 ring-accent/40" : ""}>
            Create Room
          </Button>
          <Button variant="secondary" onClick={() => setMode("join")} className={mode === "join" ? "ring-2 ring-accent/40" : ""}>
            Join Room
          </Button>
        </div>
      </div>

      <ErrorNote message={err} />

      {mode === "create" && (
        <Card>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              create();
            }}
          >
            <label className="block text-sm font-medium">Event name (optional)</label>
            <input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Night School Demo Day" autoFocus />
            <p className="text-xs text-muted">Shown to attendees and saved as “Met at …” on every card.</p>
            <Button type="submit" busy={busy} className="w-full">
              Generate room code
            </Button>
          </form>
        </Card>
      )}

      {mode === "join" && (
        <Card>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              const c = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
              if (c) router.push(`/drop/${c}`);
            }}
          >
            <label className="block text-sm font-medium">Room code</label>
            <input
              className="field text-center font-mono text-2xl uppercase tracking-[0.3em]"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="ABC123"
              maxLength={8}
              autoFocus
              autoCapitalize="characters"
              autoComplete="off"
            />
            <Button type="submit" className="w-full" disabled={!code.trim()}>
              Join
            </Button>
          </form>
        </Card>
      )}

      <ol className="grid gap-3 sm:grid-cols-3">
        {STEPS.map((s, i) => (
          <li key={s.title} className="rounded-2xl border border-line bg-card p-4">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-soft font-semibold text-accent">{i + 1}</span>
            <p className="mt-3 font-medium">{s.title}</p>
            <p className="mt-1 text-sm text-muted">{s.body}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}
