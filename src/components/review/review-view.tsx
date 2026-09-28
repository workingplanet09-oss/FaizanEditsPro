import { notFound } from "next/navigation";
import type { Actor } from "@/server/auth/actor";
import { guard } from "@/server/page";
import { getReviewData, getVersionPlayback, getVersionPoster } from "@/server/services/reviews";
import { EmptyState, Card } from "@/components/ui/primitives";
import { ButtonLink } from "@/components/ui/button";
import { ReviewPlayer, type PlaybackInfo } from "./review-player";

/** Server half of the review page: loads the version, its notes and a fresh signed playback URL. */
export async function ReviewView({ actor, base, projectId, versionId }: { actor: Actor; base: "/dashboard" | "/admin" | "/editor"; projectId: string; versionId?: string }) {
  const data = await guard(() => getReviewData(actor, projectId, versionId));
  if (versionId && data.versions.length && !data.versions.some((v) => v.id === versionId)) notFound();
  if (!data.current) {
    return (
      <Card>
        <EmptyState icon="film" title="No drafts to review yet" description="As soon as the first version is uploaded it will appear here, ready for timestamped notes." action={<ButtonLink href={`${base}/projects/${projectId}`} variant="outline">Back to project</ButtonLink>} />
      </Card>
    );
  }
  let playback: PlaybackInfo;
  try {
    const p = await getVersionPlayback(actor, data.current.id);
    playback = { url: p.url, external: p.external, mimeType: p.mimeType };
  } catch (e: any) {
    playback = { url: null, external: false, error: e?.message ?? "Video unavailable" };
  }
  const posterUrl = await getVersionPoster(actor, data.current.id).then((r) => r.url).catch(() => null);
  return <ReviewPlayer base={base} staff={actor.isStaff} me={{ id: actor.userId, name: actor.name }} project={data.project} versions={data.versions} current={data.current} comments={data.comments} perms={data.perms} playback={playback} posterUrl={posterUrl} />;
}
