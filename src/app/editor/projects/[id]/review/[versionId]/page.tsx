import { requirePageActor } from "@/server/auth/actor";
import { ReviewView } from "@/components/review/review-view";

export const metadata = { title: "Review video", robots: { index: false, follow: false } };

export default async function ReviewPage({ params }: { params: Promise<{ id: string; versionId: string }> }) {
  const { id, versionId } = await params;
  const actor = await requirePageActor("editor", `/editor/projects/${id}/review/${versionId}`);
  return <ReviewView actor={actor} base="/editor" projectId={id} versionId={versionId} />;
}
