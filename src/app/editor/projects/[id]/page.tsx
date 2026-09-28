import { requirePageActor } from "@/server/auth/actor";
import { ProjectWorkspace } from "@/components/admin/project-workspace";
import type { SearchParams } from "@/server/page";

export const metadata = { title: "Project", robots: { index: false, follow: false } };

export default async function EditorProjectPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SearchParams }) {
  const { id } = await params;
  const actor = await requirePageActor("editor", `/editor/projects/${id}`);
  return <ProjectWorkspace actor={actor} id={id} sp={await searchParams} base="/editor" />;
}
