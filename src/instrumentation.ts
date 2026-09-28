export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.JOBS_INLINE === "false") return;
  const { startInlineWorker } = await import("./server/jobs/inline");
  startInlineWorker();
}
