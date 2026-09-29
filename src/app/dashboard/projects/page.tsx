import { requirePageActor } from "@/server/auth/actor";
import { listClientProjects } from "@/server/services/projects";
import { first, type SearchParams } from "@/server/page";
import { PageHeader, EmptyState, Card } from "@/components/ui/primitives";
import { ButtonLink } from "@/components/ui/button";
import { TabNav } from "@/components/ui/tabs";
import { ProjectCard } from "@/components/portal/common";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta({ title: "Projects", path: "/dashboard/projects", noindex: true });

export default async function ProjectsPage({ searchParams }: { searchParams: SearchParams }) {
  const actor = await requirePageActor("client", "/dashboard/projects");
  const sp = await searchParams;
  const tab = first(sp.tab) ?? "active";
  const all = await listClientProjects(actor, { includeClosed: true });
  const active = all.filter((p) => !["DELIVERED", "ARCHIVED", "CANCELLED"].includes(p.status));
  const delivered = all.filter((p) => ["DELIVERED", "ARCHIVED"].includes(p.status));
  const rows = tab === "delivered" ? delivered : tab === "all" ? all : active;
  return (
    <>
      <PageHeader title="Projects" description="Every video you've commissioned, from first quote to final delivery." actions={<ButtonLink href="/start-project" icon="plus" variant="dark">New project</ButtonLink>} />
      <TabNav basePath="/dashboard/projects" active={tab} tabs={[{ key: "active", label: "Active", count: active.length }, { key: "delivered", label: "Delivered", count: delivered.length }, { key: "all", label: "All", count: all.length }]} />
      {rows.length ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">{rows.map((p) => <ProjectCard key={p.id} p={p} />)}</div>
      ) : (
        <Card>
          <EmptyState icon="film" title={tab === "delivered" ? "Nothing delivered yet" : "No projects here"} description={tab === "delivered" ? "Finished projects and their final files will be kept here." : "Start a project and it will appear here with a live progress tracker."} action={<ButtonLink href="/start-project">Start a project</ButtonLink>} />
        </Card>
      )}
    </>
  );
}
