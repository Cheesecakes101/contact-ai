"use client";

import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { categoryLabel } from "@/lib/types";

type Variant = "primary" | "secondary" | "ghost" | "danger";

export function Button({
  variant = "primary",
  className = "",
  busy,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; busy?: boolean }) {
  const styles: Record<Variant, string> = {
    primary: "bg-accent text-white hover:opacity-90",
    secondary: "bg-card border border-line hover:bg-accent-soft",
    ghost: "hover:bg-accent-soft text-muted hover:text-ink",
    danger: "text-red-600 hover:bg-red-50 dark:hover:bg-red-950",
  };
  return (
    <button
      {...props}
      disabled={props.disabled || busy}
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition disabled:opacity-50 ${styles[variant]} ${className}`}
    >
      {busy && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />}
      {children}
    </button>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-2xl border border-line bg-card p-4 sm:p-5 ${className}`}>{children}</section>;
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">{children}</h2>
      {action}
    </div>
  );
}

export function Chip({ children, onRemove, tone = "default" }: { children: ReactNode; onRemove?: () => void; tone?: "default" | "accent" }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs ${
        tone === "accent" ? "bg-accent-soft text-accent" : "border border-line bg-paper"
      }`}
    >
      {children}
      {onRemove && (
        <button type="button" onClick={onRemove} className="ml-0.5 text-muted hover:text-ink" aria-label="Remove">
          ×
        </button>
      )}
    </span>
  );
}

const CATEGORY_TONE: Record<string, string> = {
  close_friend: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200",
  friend: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  acquaintance: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
  professional: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200",
};

export function CategoryBadge({ category }: { category: string }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${CATEGORY_TONE[category] ?? CATEGORY_TONE.acquaintance}`}>
      {categoryLabel(category)}
    </span>
  );
}

export function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const hue = hash % 360;
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
      style={{ width: size, height: size, fontSize: size * 0.38, background: `hsl(${hue} 45% 52%)` }}
    >
      {initials || "?"}
    </span>
  );
}

export function UnverifiedBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-warn-soft px-2 py-0.5 text-[11px] font-medium text-warn">
      ⚠ AI-estimated · unverified
    </span>
  );
}

export function Empty({ title, children, href, cta }: { title: string; children?: ReactNode; href?: string; cta?: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-line p-8 text-center">
      <p className="font-medium">{title}</p>
      {children && <div className="mt-1 text-sm text-muted">{children}</div>}
      {href && cta && (
        <Link href={href} className="mt-4 inline-block rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white">
          {cta}
        </Link>
      )}
    </div>
  );
}

export function ErrorNote({ message }: { message: string | null }) {
  if (!message) return null;
  return <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">{message}</p>;
}
