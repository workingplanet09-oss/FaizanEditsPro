import { requirePageActor } from "@/server/auth/actor";
import { RevisionsBoard } from "@/components/admin/revisions-board";
import type { SearchParams } from "@/server/page";

export const metadata = { title: "Revisions", robots: { index: false, follow: false } };

export default async function RevisionsEditor({ searchParams }: { searchParams: SearchParams }) {
  const actor = await requirePageActor("editor", "/editor/revisions");
  return <RevisionsBoard actor={actor} sp={await searchParams} base="/editor" />;
}
