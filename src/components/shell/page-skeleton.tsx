import { Card, Skeleton, SkeletonRows } from "@/components/ui/primitives";

/** Shown by each portal's loading.tsx while a server page streams in. Shapes mirror a typical page: header, stat cards, a list. */
export function PageSkeleton() {
  return (
    <div aria-busy="true">
      <span role="status" className="sr-only">
        Loading…
      </span>
      <div aria-hidden>
        <Skeleton className="mb-3 h-9 w-64 max-w-full" />
        <Skeleton className="mb-8 h-4 w-96 max-w-full" />
        <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="p-5">
              <Skeleton className="mb-4 h-3 w-24" />
              <Skeleton className="h-7 w-16" />
            </Card>
          ))}
        </div>
        <Card>
          <SkeletonRows rows={6} />
        </Card>
      </div>
    </div>
  );
}
