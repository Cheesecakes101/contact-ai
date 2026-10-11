"use client";

import Link from "next/link";
import type { Contact } from "@/lib/types";
import { timeAgo } from "./api";
import { Avatar, CategoryBadge } from "./ui";

export function ContactRow({ contact: c, detail }: { contact: Contact; detail?: React.ReactNode }) {
  const sub = [c.role, c.company].filter(Boolean).join(" · ") || c.context?.whatTheyDo || c.context?.metWhere || c.phone || c.email;
  return (
    <Link href={`/contacts/${c.id}`} className="flex items-start gap-3 rounded-xl p-2.5 transition hover:bg-accent-soft/60">
      <Avatar name={c.name} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate font-medium">{c.name}</p>
          <CategoryBadge category={c.category} />
        </div>
        {sub && <p className="truncate text-sm text-muted">{sub}</p>}
        {detail && <div className="mt-1 text-sm">{detail}</div>}
      </div>
      <span className="shrink-0 pt-0.5 text-xs text-muted">{c.lastInteractionAt ? timeAgo(c.lastInteractionAt) : ""}</span>
    </Link>
  );
}
