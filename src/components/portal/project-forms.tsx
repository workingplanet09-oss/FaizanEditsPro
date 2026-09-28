"use client";

import { useState } from "react";
import { api } from "@/lib/api-client";
import { useAction } from "@/lib/use-action";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea, Checkbox } from "@/components/ui/form";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/cn";

export function ChangeRequestForm({ projectId }: { projectId: string }) {
  const toast = useToast();
  const [v, setV] = useState({ whatChanged: "", why: "", additionalRequirements: "" });
  const go = useAction(async () => api(`/api/projects/${projectId}/change-requests`, { body: { whatChanged: v.whatChanged, why: v.why || undefined, additionalRequirements: v.additionalRequirements || undefined } }), {
    onSuccess: () => {
      setV({ whatChanged: "", why: "", additionalRequirements: "" });
      toast.success("Change request sent", "We'll confirm whether it's included or needs a quote.");
    },
  });
  return (
    <form noValidate onSubmit={(e) => (e.preventDefault(), void go.run())} className="space-y-4 rounded-[var(--radius-card)] border border-line bg-surface p-5 shadow-soft">
      <div>
        <h3 className="text-base font-extrabold">Request a change to the brief</h3>
        <p className="mt-1 text-sm text-muted">Production has started, so the brief is locked. Tell us what changed and we'll confirm whether it's included or needs a small quote — nothing is charged without your approval.</p>
      </div>
      {go.error ? <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm font-medium text-danger">{go.error}</p> : null}
      <Field label="What changed?" required error={go.fields.whatChanged}>{(p) => <Textarea {...p} rows={3} value={v.whatChanged} onChange={(e) => setV({ ...v, whatChanged: e.target.value })} placeholder="e.g. The client has asked for a 9:16 version as well." />}</Field>
      <Field label="Why?">{(p) => <Textarea {...p} rows={2} value={v.why} onChange={(e) => setV({ ...v, why: e.target.value })} />}</Field>
      <Field label="Anything new we should know?">{(p) => <Textarea {...p} rows={2} value={v.additionalRequirements} onChange={(e) => setV({ ...v, additionalRequirements: e.target.value })} />}</Field>
      <Button type="submit" loading={go.pending} disabled={v.whatChanged.trim().length < 5}>Submit change request</Button>
    </form>
  );
}

export function FeedbackForm({ projectId, defaults }: { projectId: string; defaults: { name: string; company: string } }) {
  const toast = useToast();
  const [rating, setRating] = useState(0);
  const [quote, setQuote] = useState("");
  const [name, setName] = useState(defaults.name);
  const [role, setRole] = useState("");
  const [company, setCompany] = useState(defaults.company);
  const [publish, setPublish] = useState(true);
  const [done, setDone] = useState(false);
  const go = useAction(async () => api(`/api/projects/${projectId}/feedback`, { body: { rating, quote, permissionToPublish: publish, name, role: role || undefined, company: company || undefined } }), {
    onSuccess: () => {
      setDone(true);
      toast.success("Thank you!", "Your feedback means a lot.");
    },
  });
  if (done) {
    return (
      <div className="rounded-[var(--radius-card)] border border-success/30 bg-success-soft/50 p-6 text-center">
        <Icon name="check-circle" size={28} className="mx-auto text-success" />
        <h3 className="mt-3 text-lg font-extrabold">Thanks for sharing your experience</h3>
        <p className="mt-1 text-sm text-muted">We read every response. {publish ? "With your permission we may feature it once we've reviewed it." : "It stays private."}</p>
      </div>
    );
  }
  return (
    <form noValidate onSubmit={(e) => (e.preventDefault(), void go.run())} className="space-y-4 rounded-[var(--radius-card)] border border-line bg-surface p-5 shadow-soft">
      <div>
        <h3 className="text-base font-extrabold">How did we do?</h3>
        <p className="mt-1 text-sm text-muted">A minute of your time helps us improve — and helps other creators choose with confidence.</p>
      </div>
      {go.error ? <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm font-medium text-danger">{go.error}</p> : null}
      <Field label="Overall rating" required error={go.fields.rating}>
        {() => (
          <div className="flex gap-1" role="radiogroup" aria-label="Rating">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={`${n} star${n > 1 ? "s" : ""}`} onClick={() => setRating(n)} className="rounded-lg p-1 text-accent transition hover:scale-110">
                <Icon name="star" size={30} className={cn(rating >= n ? "fill-current" : "opacity-30")} />
              </button>
            ))}
          </div>
        )}
      </Field>
      <Field label="Your experience" required error={go.fields.quote}>{(p) => <Textarea {...p} rows={4} value={quote} onChange={(e) => setQuote(e.target.value)} placeholder="What went well? What made the biggest difference?" />}</Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Name" required error={go.fields.name}>{(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} />}</Field>
        <Field label="Role">{(p) => <Input {...p} value={role} onChange={(e) => setRole(e.target.value)} />}</Field>
        <Field label="Company">{(p) => <Input {...p} value={company} onChange={(e) => setCompany(e.target.value)} />}</Field>
      </div>
      <Checkbox checked={publish} onChange={(e) => setPublish(e.target.checked)} label="You may publish this on the website" description="Only shown after the studio reviews it. You can ask us to remove it any time." />
      <Button type="submit" loading={go.pending} disabled={!rating || quote.trim().length < 10 || name.trim().length < 2}>Send feedback</Button>
    </form>
  );
}
