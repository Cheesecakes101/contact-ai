"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { api } from "@/components/api";
import { AskBox } from "@/components/AskBox";
import { ContactRow } from "@/components/ContactRow";
import { Card, Empty, ErrorNote } from "@/components/ui";
import type { Contact } from "@/lib/types";

interface Result {
  id: string;
  reason: string;
  strength: "strong" | "possible";
  contact: Contact;
}

export default function SearchPage() {
  return (
    <Suspense>
      <Search />
    </Suspense>
  );
}

function Search() {
  const params = useSearchParams();
  const router = useRouter();
  const q = params.get("q") ?? "";
  const [busy, setBusy] = useState(false);
  const [data, setData] = useState<{ answer: string; mode: string; results: Result[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!q) {
      setData(null);
      return;
    }
    let cancelled = false;
    setBusy(true);
    setErr(null);
    api<{ answer: string; mode: string; results: Result[] }>("/api/search", { json: { q } })
      .then((d) => !cancelled && setData(d))
      .catch((e) => !cancelled && setErr((e as Error).message))
      .finally(() => !cancelled && setBusy(false));
    return () => {
      cancelled = true;
    };
  }, [q]);

  const strong = data?.results.filter((r) => r.strength === "strong") ?? [];
  const possible = data?.results.filter((r) => r.strength === "possible") ?? [];

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold tracking-tight">Ask your network</h1>
      <AskBox key={q} initial={q} autoFocus={!q} onAsk={(v) => router.push(`/search?q=${encodeURIComponent(v)}`)} />
      <ErrorNote message={err} />
      {busy && (
        <p className="flex items-center gap-2 text-sm text-muted">
          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          Thinking about who you know…
        </p>
      )}
      {!busy && data && (
        <>
          {data.answer && <p className="text-lg leading-snug">{data.answer}</p>}
          {data.mode === "keyword" && <p className="text-xs text-muted">Keyword match (AI search is off).</p>}
          {data.results.length === 0 ? (
            <Empty title="No one matches yet">Try different words, or add more context to your contacts.</Empty>
          ) : (
            <>
              {strong.length > 0 && (
                <Card className="!p-2">
                  {strong.map((r) => (
                    <ContactRow key={r.id} contact={r.contact} detail={<span className="text-ink/80">{r.reason}</span>} />
                  ))}
                </Card>
              )}
              {possible.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Possibly</p>
                  <Card className="!p-2">
                    {possible.map((r) => (
                      <ContactRow key={r.id} contact={r.contact} detail={<span className="text-muted">{r.reason}</span>} />
                    ))}
                  </Card>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
