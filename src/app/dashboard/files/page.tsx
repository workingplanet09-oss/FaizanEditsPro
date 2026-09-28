import { requirePageActor } from "@/server/auth/actor";
import { listAllAssets } from "@/server/services/assets";
import { first, num, type SearchParams } from "@/server/page";
import { PageHeader, Card } from "@/components/ui/primitives";
import { Pagination, FilterBar } from "@/components/ui/table";
import { FileManager } from "@/components/portal/file-manager";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta({ title: "Files", path: "/dashboard/files", noindex: true });

export default async function FilesPage({ searchParams }: { searchParams: SearchParams }) {
  const actor = await requirePageActor("client", "/dashboard/files");
  const sp = await searchParams;
  const q = first(sp.q);
  const res = await listAllAssets(actor, { q, page: num(sp.page) });
  return (
    <>
      <PageHeader title="Files" description="Everything you've uploaded and every draft and deliverable across your projects. Add files to a specific project from its Files tab." />
      <Card className="mb-5 overflow-visible"><FilterBar action="/dashboard/files" values={{ q }} fields={[{ name: "q", label: "Search files", placeholder: "Search by file name…" }]} /></Card>
      <FileManager files={res.items as any} showProject canUpload={false} canDelete={false} />
      {!res.items.length ? null : <Pagination page={res.page} pages={res.pages} total={res.total} basePath="/dashboard/files" params={{ q }} />}
    </>
  );
}
