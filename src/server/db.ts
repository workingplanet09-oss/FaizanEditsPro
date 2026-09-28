import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { env } from "./env";

const globalForPrisma = globalThis as unknown as { __prisma?: PrismaClient };

function create() {
  const adapter = new PrismaPg({ connectionString: env.databaseUrl, max: 10 });
  return new PrismaClient({ adapter });
}

export const db: PrismaClient = globalForPrisma.__prisma ?? create();
if (!env.isProd) globalForPrisma.__prisma = db;

export type Db = typeof db;
/** A transaction client or the root client — services accept either. */
export type Tx = Parameters<Parameters<typeof db.$transaction>[0]>[0];
