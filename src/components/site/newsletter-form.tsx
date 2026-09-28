"use client";

import { useState } from "react";
import { api, ApiError } from "@/lib/api-client";
import { Icon } from "@/components/ui/icon";

export function NewsletterForm() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [msg, setMsg] = useState("");
  return (
    <form
      className="mt-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setState("loading");
        try {
          await api("/api/newsletter", { body: { email } });
          setState("done");
          setEmail("");
        } catch (err) {
          setState("error");
          setMsg(err instanceof ApiError ? err.message : "Couldn't subscribe. Try again.");
        }
      }}
    >
      <div className="flex gap-2">
        <label className="sr-only" htmlFor="nl-email">
          Email address
        </label>
        <input id="nl-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@email.com" className="h-10 min-w-0 flex-1 rounded-xl border border-line-strong bg-surface px-3 text-sm placeholder:text-subtle focus:border-accent focus:outline-none" />
        <button type="submit" disabled={state === "loading"} className="h-10 rounded-xl bg-fg px-4 text-sm font-bold text-bg hover:opacity-90 disabled:opacity-50">
          {state === "loading" ? "…" : "Join"}
        </button>
      </div>
      <p role="status" className="mt-2 min-h-4 text-xs">
        {state === "done" ? (
          <span className="inline-flex items-center gap-1 text-success">
            <Icon name="check" size={12} /> You're subscribed.
          </span>
        ) : state === "error" ? (
          <span className="text-danger">{msg}</span>
        ) : null}
      </p>
    </form>
  );
}
