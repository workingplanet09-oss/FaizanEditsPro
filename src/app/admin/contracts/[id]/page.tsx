import Link from "next/link";
import { requirePageActor, can } from "@/server/auth/actor";
import { guard } from "@/server/page";
import { getContract } from "@/server/services/contracts";
import { renderMarkdown } from "@/lib/markdown";
import { Card, CardHeader, PageHeader } from "@/components/ui/primitives";
import { ActionButton } from "@/components/ui/action-button";
import { ButtonLink } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { ContractBadge } from "@/components/portal/common";
import { ContractEditor } from "@/components/admin/doc-actions";
import { formatDateTime } from "@/lib/format";

export const metadata = { title: "Contract", robots: { index: false, follow: false } };

export default async function ContractAdminPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requirePageActor("admin", `/admin/contracts/${id}`);
  const c = await guard(() => getContract(actor, id));
  const canWrite = can(actor, "contracts:write");
  return (
    <>
      <div className="mb-2"><Link href="/admin/contracts" className="inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-fg"><Icon name="chevron-left" size={14} /> Contracts</Link></div>
      <PageHeader
        title={<span className="flex flex-wrap items-center gap-3">{c.number}<ContractBadge value={c.status} /></span>}
        description={<>{c.title} · {c.client.companyName} · <Link className="font-semibold text-fg hover:underline" href={`/admin/projects/${c.project.id}`}>{c.project.code}</Link> · version {c.currentVersion}</>}
        actions={<><ButtonLink href={`/api/contracts/${id}/download`} icon="download" variant="outline">Download / print</ButtonLink>{canWrite && c.status !== "SIGNED" ? <ActionButton url={`/api/contracts/${id}/send`} icon="send" variant="dark" success="Contract sent for signature">{c.status === "DRAFT" ? "Send for signature" : "Resend"}</ActionButton> : null}</>}
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-6">
          <Card className="p-6 sm:p-10">
            <div className="space-y-7">{c.sections.map((s) => <section key={s.key}><h2 className="text-base font-extrabold">{s.title}</h2><div className="mt-2 text-sm leading-relaxed text-muted [&_li]:ml-4 [&_li]:list-disc [&_p]:mb-2" dangerouslySetInnerHTML={{ __html: renderMarkdown(s.body) }} /></section>)}</div>
          </Card>
          {canWrite && c.status !== "SIGNED" ? <ContractEditor id={id} title={c.title} sections={c.sections} editable /> : null}
        </div>
        <aside className="space-y-4">
          <Card>
            <CardHeader title="Signature record" />
            {c.signatures.length ? (
              <ul className="divide-y divide-line">{c.signatures.map((s) => (
                <li key={s.id} className="space-y-1 px-5 py-4 text-sm">
                  <div className="font-bold">{s.signerName}</div><div className="text-muted">{s.signerEmail}</div>
                  <div>{formatDateTime(s.signedAt)} · v{s.version}</div>
                  {"ip" in s ? <div className="text-xs text-subtle">IP {String((s as any).ip ?? "—")}<br />{String((s as any).userAgent ?? "").slice(0, 80)}<br />Hash {String((s as any).contentHash ?? "").slice(0, 20)}…</div> : null}
                </li>))}</ul>
            ) : <p className="px-5 pb-5 text-sm text-muted">{c.sentAt ? "Sent — awaiting signature." : "Not sent yet."}</p>}
          </Card>
          <Card><CardHeader title="Versions" /><ul className="px-5 pb-5 text-sm text-muted">{c.versions.map((v) => <li key={v.version}>v{v.version} · {formatDateTime(v.createdAt)}</li>)}</ul></Card>
        </aside>
      </div>
    </>
  );
}
