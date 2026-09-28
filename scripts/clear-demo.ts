/**
 * Removes every row flagged isDemo (and the files stored for them). Real data is never touched.
 *   npm run db:clear-demo
 */
import "dotenv/config";
import { db } from "../src/server/db";
import { getStorage } from "../src/server/storage";

const DEMO_DOMAIN = "@demo.faizaneditspro.test";

async function main() {
  const storage = getStorage();

  // 1) stored files first (asset rows may cascade away with their project)
  const assets = await db.asset.findMany({
    where: { OR: [{ isDemo: true }, { project: { isDemo: true } }, { client: { isDemo: true } }] },
    select: { storageKey: true, thumbnailKey: true },
  });
  for (const a of assets) {
    await storage.remove(a.storageKey).catch(() => {});
    if (a.thumbnailKey) await storage.remove(a.thumbnailKey).catch(() => {});
  }

  // 2) delete flagged rows; FK order is resolved by retrying until nothing more can be removed
  const demoUserIds = (await db.user.findMany({ where: { isDemo: true }, select: { id: true } })).map((u) => u.id);
  await db.auditLog.deleteMany({ where: { actorId: { in: demoUserIds } } });
  // every model that carries an isDemo flag — children first, people last
  let pending = ["ActivityLog", "Notification", "Message", "VideoComment", "RevisionRequest", "VideoVersion", "Payment", "Invoice", "Contract", "Quote", "Meeting", "Retainer", "Asset", "Project", "Testimonial", "CaseStudy", "PortfolioProject", "BlogPost", "PricingPlan", "ContactSubmission", "Lead", "Client", "Organization", "User"];
  const counts: Record<string, number> = {};
  for (let pass = 0; pass < 8 && pending.length; pass++) {
    const next: string[] = [];
    for (const name of pending) {
      const delegate = (db as any)[name.charAt(0).toLowerCase() + name.slice(1)];
      try {
        const r = await delegate.deleteMany({ where: { isDemo: true } });
        counts[name] = (counts[name] ?? 0) + r.count;
      } catch (e: any) {
        if (e?.code === "P2003" || /foreign key/i.test(String(e?.message))) next.push(name);
        else throw e;
      }
    }
    if (next.length === pending.length && pass > 0) {
      console.warn("Could not remove some rows because real data still references them:", next.join(", "));
      break;
    }
    pending = next;
  }

  // 3) emails and jobs generated for demo addresses
  const emails = await db.emailLog.deleteMany({ where: { toEmail: { endsWith: DEMO_DOMAIN } } });
  const jobs = await db.job.deleteMany({ where: { status: { in: ["PENDING", "FAILED"] }, payload: { path: [], string_contains: DEMO_DOMAIN } } }).catch(() => ({ count: 0 }));
  await db.auditLog.deleteMany({ where: { message: { contains: DEMO_DOMAIN } } }).catch(() => {});

  const removed = Object.entries(counts).filter(([, n]) => n > 0);
  console.log(`\nDemo data removed ✔  (${removed.map(([k, n]) => `${k}: ${n}`).join(", ") || "nothing to remove"}; ${emails.count} demo emails, ${jobs.count} queued jobs, ${assets.length} stored files)\n`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
