import { requirePageActor, can } from "@/server/auth/actor";
import { listAllAssets } from "@/server/services/assets";
import { guard, first, num, type SearchParams } from "@/server/page";
import { Card, PageHeader } from "@/components/ui/primitives";
import { FilterBar, Pagination } from "@/components/ui/table";
import { FileManager } from "@/components/portal/file-manager";

export const metadata = { title: "Files", robots: { index: false, follow: false } };

export default async function FilesEditor({ searchParams }: { searchParams: SearchParams }) {
  const actor = await requirePageActor("editor", "/editor/files");
  const sp = await searchParams;
  const q = first(sp.q);
  const res = await guard(() => listAllAssets(actor, { q, page: num(sp.page) }));
  return (
    <>
      <PageHeader title="Files" description="Client assets and drafts across your assigned projects. Open a project to upload versions or deliverables." />
      <Card className="mb-5 overflow-visible"><FilterBar action="/editor/files" values={{ q }} fields={[{ name: "q", label: "Search files", placeholder: "Search by file name…" }]} /></Card>
      <FileManager staff projectBase="/editor" showProject files={res.items as any} canUpload={false} canDelete={can(actor, "files:delete")} canShare={can(actor, "files:write")} />
      <Pagination page={res.page} pages={res.pages} total={res.total} basePath="/editor/files" params={{ q }} />
    </>
  );
}
