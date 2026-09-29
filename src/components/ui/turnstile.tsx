"use client";

import { useEffect, useRef } from "react";

interface TurnstileApi {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  remove: (id: string) => void;
}
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

/**
 * Cloudflare Turnstile challenge. Renders nothing unless a site key is configured (the server only verifies tokens under the same
 * condition). `onToken("")` is called when the token expires or the challenge errors, so the form can block submission again.
 * Tokens are single-use: change `resetKey` after a submission attempt to mount a fresh widget.
 */
export function TurnstileWidget({ siteKey, onToken, resetKey = 0, className }: { siteKey: string; onToken: (token: string) => void; resetKey?: number; className?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const callback = useRef(onToken);
  callback.current = onToken;

  useEffect(() => {
    if (!siteKey || !box.current) return;
    let cancelled = false;
    let widgetId: string | null = null;
    const mount = () => {
      if (cancelled || !box.current || !window.turnstile) return;
      widgetId = window.turnstile.render(box.current, {
        sitekey: siteKey,
        theme: "auto",
        callback: (token: string) => callback.current(token),
        "expired-callback": () => callback.current(""),
        "error-callback": () => callback.current(""),
      });
    };
    if (window.turnstile) mount();
    else {
      let script = document.querySelector<HTMLScriptElement>("script[data-turnstile]");
      if (!script) {
        script = document.createElement("script");
        script.src = SCRIPT;
        script.async = true;
        script.dataset.turnstile = "1";
        document.head.appendChild(script);
      }
      script.addEventListener("load", mount);
    }
    return () => {
      cancelled = true;
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId);
    };
  }, [siteKey, resetKey]);

  if (!siteKey) return null;
  return <div ref={box} className={className} data-testid="turnstile" />;
}
