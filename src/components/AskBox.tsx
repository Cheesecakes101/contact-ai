"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export const EXAMPLES = [
  "Who do I know in venture capital?",
  "Who did I meet at Night School?",
  "Who can help me with jewellery?",
  "Who haven't I spoken to in a while?",
];

export function AskBox({ initial = "", onAsk, autoFocus }: { initial?: string; onAsk?: (q: string) => void; autoFocus?: boolean }) {
  const router = useRouter();
  const [q, setQ] = useState(initial);
  const submit = (query: string) => {
    const v = query.trim();
    if (!v) return;
    if (onAsk) onAsk(v);
    else router.push(`/search?q=${encodeURIComponent(v)}`);
  };
  return (
    <div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(q);
        }}
        className="flex items-center gap-2 rounded-2xl border border-line bg-card p-1.5 pl-4 shadow-sm focus-within:border-accent"
      >
        <span className="text-accent">✦</span>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Ask about your network…"
          className="min-w-0 flex-1 bg-transparent py-2 outline-none"
          autoFocus={autoFocus}
          enterKeyHint="search"
        />
        <button type="submit" className="rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-40" disabled={!q.trim()}>
          Ask
        </button>
      </form>
      <div className="mt-2 flex gap-2 overflow-x-auto pb-1 text-xs [scrollbar-width:none]">
        {EXAMPLES.map((e) => (
          <button
            key={e}
            onClick={() => {
              setQ(e);
              submit(e);
            }}
            className="shrink-0 rounded-full border border-line bg-card px-3 py-1 text-muted hover:text-ink"
          >
            {e}
          </button>
        ))}
      </div>
    </div>
  );
}
