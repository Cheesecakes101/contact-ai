"use client";

import { useState } from "react";
import { api } from "@/components/api";
import { Button, Card, ErrorNote } from "@/components/ui";

export default function Login() {
  const [passcode, setPasscode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="mx-auto mt-16 max-w-sm">
      <Card>
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setErr(null);
            try {
              await api("/api/login", { json: { passcode } });
              const next = new URLSearchParams(window.location.search).get("next");
              window.location.href = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
            } catch (x) {
              setErr((x as Error).message);
              setBusy(false);
            }
          }}
        >
          <h1 className="text-xl font-semibold">
            Contact<span className="text-accent">AI</span>
          </h1>
          <input className="field" type="password" placeholder="Passcode" value={passcode} onChange={(e) => setPasscode(e.target.value)} autoFocus />
          <ErrorNote message={err} />
          <Button type="submit" className="w-full" busy={busy}>
            Unlock
          </Button>
        </form>
      </Card>
    </div>
  );
}
