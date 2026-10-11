"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/", label: "Home", icon: "⌂" },
  { href: "/search", label: "Ask", icon: "✦" },
  { href: "/add", label: "Add", icon: "+" , primary: true },
  { href: "/contacts", label: "People", icon: "☰" },
  { href: "/drop", label: "Drop", icon: "⇄" },
];

export function Nav() {
  const path = usePathname();
  if (path === "/login") return null;
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  return (
    <>
      <header className="sticky top-0 z-20 hidden border-b border-line bg-paper/90 backdrop-blur sm:block">
        <div className="mx-auto flex max-w-3xl items-center gap-1 px-4 py-3">
          <Link href="/" className="mr-4 font-semibold tracking-tight">
            Contact<span className="text-accent">AI</span>
          </Link>
          {ITEMS.map((i) => (
            <Link
              key={i.href}
              href={i.href}
              className={`rounded-lg px-3 py-1.5 text-sm ${
                i.primary
                  ? "ml-auto bg-accent text-white"
                  : active(i.href)
                    ? "bg-accent-soft text-accent"
                    : "text-muted hover:text-ink"
              } ${i.primary ? "order-last" : ""}`}
            >
              {i.primary ? "+ Add person" : i.label}
            </Link>
          ))}
        </div>
      </header>
      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden">
        <div className="mx-auto grid max-w-md grid-cols-5">
          {ITEMS.map((i) => (
            <Link key={i.href} href={i.href} className="flex flex-col items-center gap-0.5 py-2 text-[11px]">
              <span
                className={`flex h-7 w-7 items-center justify-center rounded-full text-base ${
                  i.primary ? "bg-accent text-white" : active(i.href) ? "text-accent" : "text-muted"
                }`}
              >
                {i.icon}
              </span>
              <span className={active(i.href) ? "text-accent" : "text-muted"}>{i.label}</span>
            </Link>
          ))}
        </div>
      </nav>
    </>
  );
}
