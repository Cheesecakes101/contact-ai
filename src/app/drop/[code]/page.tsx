"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import QRCode from "qrcode";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/components/api";
import { Avatar, Button, Card, ErrorNote, SectionTitle } from "@/components/ui";
import type { Room, RoomCard } from "@/lib/types";

interface RoomState {
  room: Room;
  isHost: boolean;
  count: number;
  cards: RoomCard[] | null;
}

interface MyCard {
  name: string;
  phone: string;
  email: string;
  profession: string;
  links: string[];
}

const EMPTY: MyCard = { name: "", phone: "", email: "", profession: "", links: ["", ""] };

function storage(key: string, value?: string | null): string | null {
  try {
    if (value === undefined) return localStorage.getItem(key);
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* storage unavailable */
  }
  return null;
}

export default function RoomPage() {
  const { code: rawCode } = useParams<{ code: string }>();
  const code = rawCode.toUpperCase();
  const [state, setState] = useState<RoomState | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [hostToken, setHostToken] = useState<string | null>(null);
  const [mine, setMine] = useState<MyCard>(EMPTY);
  const [editToken, setEditToken] = useState<string | null>(null);
  const [editing, setEditing] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [imported, setImported] = useState<string | null>(null);
  const shareUrl = typeof window !== "undefined" ? `${window.location.origin}/drop/${code}` : "";

  useEffect(() => {
    setHostToken(storage(`drop-host-${code}`));
    const token = storage(`drop-card-${code}`);
    const saved = storage(`drop-mine-${code}`);
    if (token && saved) {
      setEditToken(token);
      try {
        setMine({ ...EMPTY, ...JSON.parse(saved) });
        setEditing(false);
      } catch {
        /* ignore */
      }
    } else {
      // Pre-fill from the last room this person joined.
      const last = storage("drop-last-card");
      if (last) {
        try {
          setMine({ ...EMPTY, ...JSON.parse(last) });
        } catch {
          /* ignore */
        }
      }
    }
  }, [code]);

  const load = useCallback(async () => {
    try {
      const s = await api<RoomState>(`/api/rooms/${code}`, { headers: hostToken ? { "x-host-token": hostToken } : {} });
      setState(s);
    } catch {
      setNotFound(true);
    }
  }, [code, hostToken]);

  useEffect(() => {
    load();
    const t = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, 4000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    if (shareUrl) QRCode.toDataURL(shareUrl, { margin: 1, width: 360 }).then(setQr).catch(() => setQr(null));
  }, [shareUrl]);

  async function submit() {
    setErr(null);
    setBusy(true);
    try {
      const res = await api<{ editToken: string }>(`/api/rooms/${code}/cards`, {
        json: { ...mine, links: mine.links.filter((l) => l.trim()), editToken },
      });
      setEditToken(res.editToken);
      storage(`drop-card-${code}`, res.editToken);
      storage(`drop-mine-${code}`, JSON.stringify(mine));
      storage("drop-last-card", JSON.stringify(mine));
      setEditing(false);
      load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function close() {
    if (!confirm("Close the room? Nobody else will be able to add their card, and everyone can download the contacts.")) return;
    setBusy(true);
    try {
      await api(`/api/rooms/${code}/close`, { method: "POST", headers: { "x-host-token": hostToken ?? "" } });
      load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function importAll() {
    if (!state?.cards) return;
    setBusy(true);
    setErr(null);
    try {
      const myPhone = mine.phone.replace(/\D/g, "");
      const others = state.cards.filter((c) => !(myPhone && c.phone.replace(/\D/g, "") === myPhone));
      const r = await api<{ created: number; skipped: number }>("/api/contacts/import", {
        json: {
          contacts: others.map((c) => ({
            name: c.name,
            phone: c.phone,
            email: c.email,
            role: c.profession,
            note: c.links.join("\n"),
          })),
          metWhere: state.room.name || `Contact Drop ${code}`,
        },
      });
      setImported(`Added ${r.created} ${r.created === 1 ? "person" : "people"}${r.skipped ? ` (${r.skipped} already saved)` : ""}.`);
    } catch (e) {
      setErr((e as Error).message === "Locked" ? "Log in to Contact AI first to save these to your contacts." : (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (notFound)
    return (
      <Card className="text-center">
        <p className="font-medium">Room {code} not found</p>
        <p className="mt-1 text-sm text-muted">Check the code with your host.</p>
        <Link href="/drop" className="mt-4 inline-block text-accent underline">
          Back to Contact Drop
        </Link>
      </Card>
    );
  if (!state) return <p className="text-muted">Loading room…</p>;

  const { room, isHost, count } = state;
  const closed = room.status === "closed";
  const vcfHref = `/api/rooms/${code}/vcf`;

  return (
    <div className="space-y-4">
      <div className="text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Contact Drop{isHost ? " · You're the host" : ""}</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{room.name || "Event room"}</h1>
        <p className="mt-2 font-mono text-4xl font-semibold tracking-[0.25em]">{code}</p>
        <p className="mt-2 text-sm text-muted">
          {closed ? "Closed" : "Open"} · {count} {count === 1 ? "card" : "cards"}
        </p>
      </div>

      <ErrorNote message={err} />

      {closed ? (
        <Card className="space-y-3 text-center">
          <p className="text-lg font-medium">The host closed the room 🎉</p>
          <p className="text-sm text-muted">
            Download everyone’s cards in one file. Your phone will offer to import them all with one tap.
          </p>
          <a href={vcfHref} download="contacts.vcf" className="inline-block w-full rounded-xl bg-accent px-4 py-3 font-medium text-white">
            ⬇ Download contacts.vcf ({count})
          </a>
          <Button variant="secondary" className="w-full" onClick={importAll} busy={busy}>
            ✦ Save all to my Contact AI
          </Button>
          {imported && (
            <p className="text-sm">
              ✓ {imported}{" "}
              <Link href="/contacts" className="text-accent underline">
                View
              </Link>
            </p>
          )}
        </Card>
      ) : (
        <>
          {isHost && (
            <Card>
              <SectionTitle>Share with attendees</SectionTitle>
              <div className="flex flex-col items-center gap-4 sm:flex-row">
                {qr && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={qr} alt={`QR code for room ${code}`} className="h-40 w-40 rounded-xl bg-white p-2" />
                )}
                <div className="w-full min-w-0 flex-1 space-y-2">
                  <p className="text-sm text-muted">Put the QR code on screen, or share the link in chat:</p>
                  <div className="flex gap-2">
                    <input className="field font-mono text-sm" readOnly value={shareUrl} onFocus={(e) => e.target.select()} />
                    <Button
                      variant="secondary"
                      onClick={async () => {
                        if (navigator.share) {
                          try {
                            await navigator.share({ title: room.name || "Contact Drop", url: shareUrl });
                            return;
                          } catch {
                            /* fall back to copy */
                          }
                        }
                        await navigator.clipboard.writeText(shareUrl);
                        setCopied(true);
                        setTimeout(() => setCopied(false), 1500);
                      }}
                    >
                      {copied ? "Copied" : "Share"}
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          )}

          <Card>
            <SectionTitle>{editToken ? "Your card" : "Add your card"}</SectionTitle>
            {editing ? (
              <form
                className="space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  submit();
                }}
              >
                <input className="field" placeholder="Full name *" value={mine.name} onChange={(e) => setMine({ ...mine, name: e.target.value })} required autoComplete="name" />
                <input className="field" type="tel" placeholder="Phone" value={mine.phone} onChange={(e) => setMine({ ...mine, phone: e.target.value })} autoComplete="tel" />
                <input className="field" type="email" placeholder="Email" value={mine.email} onChange={(e) => setMine({ ...mine, email: e.target.value })} autoComplete="email" />
                <input className="field" placeholder="Profession (e.g. Founder @ Acme)" value={mine.profession} onChange={(e) => setMine({ ...mine, profession: e.target.value })} autoComplete="organization-title" />
                {mine.links.map((l, i) => (
                  <input
                    key={i}
                    className="field"
                    type="url"
                    inputMode="url"
                    placeholder={i === 0 ? "LinkedIn URL (optional)" : "Instagram / website (optional)"}
                    value={l}
                    onChange={(e) => setMine({ ...mine, links: mine.links.map((x, j) => (j === i ? e.target.value : x)) })}
                  />
                ))}
                <p className="text-xs text-muted">No account needed. Shared only with people in this room once the host closes it.</p>
                <Button type="submit" className="w-full" busy={busy}>
                  {editToken ? "Update my card" : "Drop my card"}
                </Button>
              </form>
            ) : (
              <div className="flex items-center gap-3">
                <Avatar name={mine.name} />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{mine.name}</p>
                  <p className="truncate text-sm text-muted">{[mine.profession, mine.phone, mine.email].filter(Boolean).join(" · ")}</p>
                </div>
                <Button variant="ghost" onClick={() => setEditing(true)}>
                  Edit
                </Button>
              </div>
            )}
            {!editing && !isHost && (
              <p className="mt-4 flex items-center gap-2 rounded-xl bg-accent-soft p-3 text-sm text-accent">
                <span className="h-2 w-2 animate-pulse rounded-full bg-accent" />
                You’re in. Keep this page open — the download appears when the host closes the room.
              </p>
            )}
          </Card>

          {isHost && (
            <Card>
              <SectionTitle>In the room ({count})</SectionTitle>
              {state.cards && state.cards.length > 0 ? (
                <ul className="mb-4 space-y-2">
                  {state.cards.map((c) => (
                    <li key={c.id} className="flex items-center gap-3">
                      <Avatar name={c.name} size={32} />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{c.name}</span>
                        <span className="block truncate text-xs text-muted">{c.profession || c.phone || c.email}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mb-4 text-sm text-muted">Waiting for people to join…</p>
              )}
              <Button className="w-full" onClick={close} busy={busy} disabled={count === 0}>
                Close room &amp; export
              </Button>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
