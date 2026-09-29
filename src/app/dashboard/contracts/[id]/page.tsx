import Link from "next/link";
import { requirePageActor } from "@/server/auth/actor";
import { guard } from "@/server/page";
import { getContract } from "@/server/services/contracts";
import { renderMarkdown } from "@/lib/markdown";
import { Card, PageHeader } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/icon";
import { ButtonLink } from "@/components/ui/button";
import { ContractBadge } from "@/components/portal/common";
import { ContractSign } from "@/components/portal/contract-sign";
import { formatDateTime } from "@/lib/format";
import { orgRoleCan } from "@/lib/permissions";

export const metadata = { title: "Contract", robots: { index: false, follow: false } };

export default async function ContractPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requirePageActor("client", `/dashboard/contracts/${id}`);
  const c = await guard(() => getContract(actor, id, { markViewed: true }));
  const signable = ["SENT", "VIEWED"].includes(c.status);
  const canSign = actor.orgs.some((o) => orgRoleCan(o.role, "approve"));
  return (
    <>
      <div className="mb-2"><Link href="/dashboard/contracts" className="inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-fg"><Icon name="chevron-left" size={14} /> Contracts</Link></div>
      <PageHeader
        title={<span className="flex flex-wrap items-center gap-3">{c.number} <ContractBadge value={c.status} /></span>}
        description={<>{c.title} · <Link className="font-semibold text-fg hover:underline" href={`/dashboard/projects/${c.project.id}`}>{c.project.name}</Link></>}
        actions={<ButtonLink href={`/api/contracts/${c.id}/download`} variant="outline" icon="download">Download / print</ButtonLink>}
      />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-6">
          <Card className="p-6 sm:p-10">
            <div className="prose-doc space-y-7">
              {c.sections.map((s) => (
                <section key={s.key}>
                  <h2 className="text-base font-extrabold">{s.title}</h2>
                  <div className="mt-2 text-sm leading-relaxed text-muted [&_li]:ml-4 [&_li]:list-disc [&_p]:mb-2" dangerouslySetInnerHTML={{ __html: renderMarkdown(s.body) }} />
                </section>
              ))}
            </div>
          </Card>
          {signable && canSign ? <ContractSign id={c.id} version={c.currentVersion} defaultName={actor.name} /> : null}
          {signable && !canSign ? <Card className="p-5 text-sm text-muted">Only account owners and managers can sign contracts. Ask one of them to open this page.</Card> : null}
        </div>
        <aside className="space-y-4">
          {c.signatures.length ? (
            <Card className="border-success/30 bg-success-soft/40 p-5">
              <div className="flex items-center gap-2 font-extrabold"><Icon name="check-circle" className="text-success" />Signed</div>
              {c.signatures.map((s) => (
                <div key={s.id} className="mt-3 border-t border-success/20 pt-3">
                  {s.signatureKind === "drawn" ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={s.signatureData} alt={`Signature of ${s.signerName}`} className="h-16 rounded-lg bg-white object-contain p-1" /> : <div className="text-2xl text-fg" style={{ fontFamily: '"Segoe Script","Snell Roundhand","Brush Script MT",cursive' }}>{s.signatureData}</div>}
                  <div className="mt-2 text-sm font-bold">{s.signerName}</div>
                  <div className="text-xs text-muted">{formatDateTime(s.signedAt)} · version {s.version}</div>
                </div>
              ))}
              <p className="mt-3 text-[11px] text-subtle">Integrity hash: <span className="font-mono">{c.contentHash.slice(0, 16)}…</span></p>
            </Card>
          ) : null}
          <Card className="p-5 text-sm">
            <h3 className="font-extrabold">Need a change?</h3>
            <p className="mt-1 text-muted">If something in the agreement doesn't look right, message us before signing and we'll update it.</p>
            <Link href={`/dashboard/projects/${c.project.id}?tab=messages`} className="mt-2 inline-block font-semibold text-accent-text hover:underline">Message the team →</Link>
          </Card>
        </aside>
      </div>
    </>
  );
}
