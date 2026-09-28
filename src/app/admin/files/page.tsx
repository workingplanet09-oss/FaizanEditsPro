import { requirePageActor, can } from "@/server/auth/actor";
import { listAllAssets } from "@/server/services/assets";
import { guard, first, num, type SearchParams } from "@/server/page";
import { Card, PageHeader } from "@/components/ui/primitives";
import { FilterBar, Pagination } from "@/components/ui/table";
import { FileManager } from "@/components/portal/file-manager";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta({ title: "Files", path: "/admin/files", noindex: true });

export default async function FilesAdmin({ searchParams }: { searchParams: SearchParams }) {
  const actor = await requirePageActor("admin", "/admin/files");
  const sp = await searchParams;
  const q = first(sp.q);
  const res = await guard(() => listAllAssets(actor, { q, page: num(sp.page) }));
  return (
    <>
      <PageHeader title="Files" description="Every uploaded file across projects. Open a project to upload or organise its files." />
      <Card className="mb-5 overflow-visible"><FilterBar action="/admin/files" values={{ q }} fields={[{ name: "q", label: "Search files", placeholder: "Search by file name…" }]} /></Card>
      <FileManager staff showProject files={res.items as any} canUpload={false} canDelete={can(actor, "files:delete")} canShare={can(actor, "files:write")} />
      <Pagination page={res.page} pages={res.pages} total={res.total} basePath="/admin/files" params={{ q }} />
    </>
  );
}
