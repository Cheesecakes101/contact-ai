"use client";

import { useState } from "react";
import type { StructuredContext } from "@/lib/types";
import { Chip } from "./ui";

export const EMPTY_CONTEXT: StructuredContext = {
  summary: "",
  metWhere: "",
  metHow: "",
  whatTheyDo: "",
  interests: [],
  collaboration: [],
  tags: [],
};

function ListEditor({
  label,
  items,
  onChange,
  placeholder,
  asChips,
}: {
  label: string;
  items: string[];
  onChange: (v: string[]) => void;
  placeholder: string;
  asChips?: boolean;
}) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const v = draft.trim();
    if (v && !items.includes(v)) onChange([...items, v]);
    setDraft("");
  };
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-muted">{label}</label>
      {asChips ? (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {items.map((t) => (
            <Chip key={t} onRemove={() => onChange(items.filter((x) => x !== t))}>
              {t}
            </Chip>
          ))}
        </div>
      ) : (
        <ul className="mb-2 space-y-1">
          {items.map((t, i) => (
            <li key={i} className="flex items-start gap-2 text-sm">
              <span className="mt-0.5 text-accent">•</span>
              <input
                className="flex-1 bg-transparent outline-none"
                value={t}
                onChange={(e) => onChange(items.map((x, j) => (j === i ? e.target.value : x)))}
              />
              <button type="button" className="text-muted hover:text-ink" onClick={() => onChange(items.filter((_, j) => j !== i))}>
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <input
        className="field text-sm"
        value={draft}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || (asChips && e.key === ",")) {
            e.preventDefault();
            add();
          }
        }}
        onBlur={add}
      />
    </div>
  );
}

export function ContextEditor({ value, onChange }: { value: StructuredContext; onChange: (v: StructuredContext) => void }) {
  const set = <K extends keyof StructuredContext>(k: K, v: StructuredContext[K]) => onChange({ ...value, [k]: v });
  return (
    <div className="space-y-4">
      <div>
        <label className="mb-1 block text-xs font-medium text-muted">Summary</label>
        <textarea className="field min-h-20 text-sm" value={value.summary} onChange={(e) => set("summary", e.target.value)} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Where you met</label>
          <input className="field text-sm" value={value.metWhere} onChange={(e) => set("metWhere", e.target.value)} placeholder="e.g. Night School demo day" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">How you met</label>
          <input className="field text-sm" value={value.metHow} onChange={(e) => set("metHow", e.target.value)} placeholder="e.g. Intro from Sam" />
        </div>
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-muted">What they do</label>
        <textarea className="field min-h-16 text-sm" value={value.whatTheyDo} onChange={(e) => set("whatTheyDo", e.target.value)} />
      </div>
      <ListEditor label="Interests" items={value.interests} onChange={(v) => set("interests", v)} placeholder="Add an interest…" asChips />
      <ListEditor
        label="Ways to collaborate / help each other"
        items={value.collaboration}
        onChange={(v) => set("collaboration", v)}
        placeholder="Add an idea…"
      />
      <ListEditor label="Tags" items={value.tags} onChange={(v) => set("tags", v)} placeholder="Add a tag…" asChips />
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium text-muted">{label}</dt>
      <dd className="mt-0.5 text-sm">{children}</dd>
    </div>
  );
}

export function ContextView({ context }: { context: StructuredContext }) {
  return (
    <div className="space-y-4">
      {context.summary && <p className="text-[15px] leading-relaxed">{context.summary}</p>}
      <dl className="grid gap-4 sm:grid-cols-2">
        {context.metWhere && <Row label="Where you met">{context.metWhere}</Row>}
        {context.metHow && <Row label="How you met">{context.metHow}</Row>}
        {context.whatTheyDo && (
          <div className="sm:col-span-2">
            <Row label="What they do">{context.whatTheyDo}</Row>
          </div>
        )}
      </dl>
      {context.interests.length > 0 && (
        <Row label="Interests">
          <div className="mt-1 flex flex-wrap gap-1.5">
            {context.interests.map((i) => (
              <Chip key={i}>{i}</Chip>
            ))}
          </div>
        </Row>
      )}
      {context.collaboration.length > 0 && (
        <Row label="Ways to help each other">
          <ul className="mt-1 space-y-1">
            {context.collaboration.map((c, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-accent">→</span>
                {c}
              </li>
            ))}
          </ul>
        </Row>
      )}
      {context.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {context.tags.map((t) => (
            <Chip key={t} tone="accent">
              #{t}
            </Chip>
          ))}
        </div>
      )}
    </div>
  );
}
