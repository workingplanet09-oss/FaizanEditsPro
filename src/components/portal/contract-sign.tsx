"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api-client";
import { useAction } from "@/lib/use-action";
import { cn } from "@/lib/cn";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input } from "@/components/ui/form";

/** E-signature: type your name or draw it. Server stores who/when/IP/UA and a hash of the exact text signed. */
export function ContractSign({ id, version, defaultName }: { id: string; version: number; defaultName: string }) {
  const toast = useToast();
  const [kind, setKind] = useState<"typed" | "drawn">("typed");
  const [name, setName] = useState(defaultName);
  const [typed, setTyped] = useState("");
  const [agree, setAgree] = useState(false);
  const [hasInk, setHasInk] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const ratio = window.devicePixelRatio || 1;
    const w = c.clientWidth;
    c.width = w * ratio;
    c.height = 160 * ratio;
    const g = c.getContext("2d")!;
    g.scale(ratio, ratio);
    g.lineWidth = 2.2;
    g.lineCap = "round";
    g.strokeStyle = "#111";
  }, [kind]);

  const pos = (e: React.PointerEvent) => {
    const r = canvas.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const down = (e: React.PointerEvent) => {
    drawing.current = true;
    canvas.current!.setPointerCapture(e.pointerId);
    const g = canvas.current!.getContext("2d")!;
    const p = pos(e);
    g.beginPath();
    g.moveTo(p.x, p.y);
  };
  const move = (e: React.PointerEvent) => {
    if (!drawing.current) return;
    const g = canvas.current!.getContext("2d")!;
    const p = pos(e);
    g.lineTo(p.x, p.y);
    g.stroke();
    setHasInk(true);
  };
  const clear = () => {
    const c = canvas.current!;
    c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
    setHasInk(false);
  };

  const sign = useAction(
    async () =>
      api(`/api/contracts/${id}/sign`, {
        body: { signerName: name, signature: kind === "typed" ? typed || name : canvas.current!.toDataURL("image/png"), kind, accept: agree, version },
      }),
    { onSuccess: () => toast.success("Contract signed", "A copy is saved to your account. Your invoice is next."), onError: (e) => toast.error("Couldn't sign", e.message) },
  );
  const ready = agree && name.trim().length >= 2 && (kind === "typed" ? (typed || name).trim().length >= 2 : hasInk);

  return (
    <section aria-labelledby="sign-h" className="rounded-[var(--radius-card)] border-2 border-accent/50 bg-surface p-5 shadow-soft sm:p-7">
      <h2 id="sign-h" className="text-lg font-extrabold">Sign this agreement</h2>
      <p className="mt-1 text-sm text-muted">By signing you confirm you have authority to enter this agreement on behalf of your company.</p>
      <div className="mt-5 space-y-5">
        <Field label="Full legal name" required>{(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />}</Field>
        <div>
          <div role="tablist" aria-label="Signature style" className="mb-3 inline-flex rounded-xl bg-surface-2 p-1 text-sm font-semibold">
            {(["typed", "drawn"] as const).map((k) => (
              <button key={k} role="tab" type="button" aria-selected={kind === k} onClick={() => setKind(k)} className={cn("rounded-lg px-4 py-1.5 transition", kind === k ? "bg-surface shadow-soft" : "text-muted")}>{k === "typed" ? "Type" : "Draw"}</button>
            ))}
          </div>
          {kind === "typed" ? (
            <div className="rounded-xl border border-line-strong bg-white px-4 py-3">
              <label htmlFor="typed-sig" className="sr-only">Type your signature</label>
              <input id="typed-sig" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={name || "Your name"} className="w-full bg-transparent text-3xl text-black outline-none placeholder:text-neutral-300" style={{ fontFamily: '"Segoe Script", "Snell Roundhand", "Brush Script MT", cursive' }} />
            </div>
          ) : (
            <div>
              <canvas ref={canvas} onPointerDown={down} onPointerMove={move} onPointerUp={() => (drawing.current = false)} className="h-40 w-full touch-none rounded-xl border border-line-strong bg-white" aria-label="Draw your signature" />
              <button type="button" onClick={clear} className="mt-1.5 text-xs font-semibold text-muted hover:text-fg">Clear</button>
            </div>
          )}
        </div>
        <Checkbox checked={agree} onChange={(e) => setAgree(e.target.checked)} label="I have read and agree to this agreement" description="My typed or drawn signature is legally binding." />
        {sign.error ? <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm font-medium text-danger">{sign.error}</p> : null}
        <Button size="lg" icon="sign" loading={sign.pending} disabled={!ready} onClick={() => void sign.run()}>Sign contract</Button>
      </div>
    </section>
  );
}
