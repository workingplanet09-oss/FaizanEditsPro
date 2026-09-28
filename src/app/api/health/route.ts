import { publicRoute } from "@/server/api";
import { db } from "@/server/db";

export const GET = publicRoute({}, async () => {
  await db.$queryRaw`SELECT 1`;
  return { status: "ok", time: new Date().toISOString() };
});
