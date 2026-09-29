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
  const demoUsers = await db.user.findMany({ where: { isDemo: true }, select: { id: true, email: true } });
  const demoUserIds = demoUsers.map((u) => u.id);
  await db.auditLog.deleteMany({ where: { actorId: { in: demoUserIds } } });

  // Remember which records are about to go — including unflagged ones created for demo clients while exploring (a quote sent,
  // an invoice paid…). Activity and audit rows about them have no foreign keys, so they are swept by id afterwards.
  const ids = async (sql: string, ...params: unknown[]) => (await db.$queryRawUnsafe<{ id: string }[]>(sql, ...params)).map((r) => r.id);
  const clientIds = await ids(`SELECT id FROM clients WHERE "isDemo"`);
  const leadIds = await ids(`SELECT id FROM leads WHERE "isDemo"`);
  const orgIds = await ids(`SELECT id FROM organizations WHERE "isDemo"`);
  const projectIds = await ids(`SELECT id FROM projects WHERE "isDemo" OR "clientId" = ANY ($1::text[])`, clientIds);
  const invoiceIds = await ids(`SELECT id FROM invoices WHERE "isDemo" OR "clientId" = ANY ($1::text[]) OR "projectId" = ANY ($2::text[])`, clientIds, projectIds);
  const quoteIds = await ids(`SELECT id FROM quotes WHERE "isDemo" OR "clientId" = ANY ($1::text[]) OR "projectId" = ANY ($2::text[])`, clientIds, projectIds);
  const contractIds = await ids(`SELECT id FROM contracts WHERE "isDemo" OR "clientId" = ANY ($1::text[]) OR "projectId" = ANY ($2::text[])`, clientIds, projectIds);
  const paymentIds = await ids(`SELECT id FROM payments WHERE "isDemo" OR "invoiceId" = ANY ($1::text[])`, invoiceIds);
  const testimonialAuthors = (await db.testimonial.findMany({ where: { isDemo: true }, select: { name: true } })).map((t) => t.name);
  // email.send jobs point at their email_logs row, which is removed below
  const emailLogIds = await ids(`SELECT id FROM email_logs WHERE "toEmail" LIKE '%' || $1 OR "toEmail" = ANY ($2::text[])`, DEMO_DOMAIN, demoUsers.map((u) => u.email));
  const audited: Record<string, string[]> = { client: clientIds, lead: leadIds, organization: orgIds, project: projectIds, invoice: invoiceIds, quote: quoteIds, contract: contractIds, payment: paymentIds, user: demoUserIds };

  // History written by demo people that carries no isDemo flag of its own (internal notes, comments, time entries…).
  // Found from the schema itself, so new tables that reference users are covered automatically.
  const counts: Record<string, number> = {};
  if (demoUserIds.length) {
    const refs = await db.$queryRawUnsafe<{ tbl: string; col: string }[]>(
      `SELECT c.conrelid::regclass::text AS tbl, a.attname AS col FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey) WHERE c.confrelid = 'users'::regclass AND c.contype = 'f' AND c.confdeltype IN ('a', 'r')`,
    );
    // several passes: replies may reference comments that are removed in the same sweep
    for (let pass = 0; pass < 3; pass++) {
      for (const r of refs) {
        const n = await db.$executeRawUnsafe(`DELETE FROM ${r.tbl} WHERE "${r.col}" = ANY ($1::text[])`, demoUserIds).catch(() => 0);
        if (n) counts[r.tbl] = (counts[r.tbl] ?? 0) + n;
      }
    }
  }
  // every model that carries an isDemo flag — children first, people last
  let pending = ["ActivityLog", "Notification", "Message", "VideoComment", "RevisionRequest", "VideoVersion", "Payment", "Invoice", "Contract", "Quote", "Meeting", "Retainer", "Asset", "Project", "Testimonial", "CaseStudy", "PortfolioProject", "BlogPost", "PricingPlan", "ContactSubmission", "Lead", "Client", "Organization", "User"];
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

  // 3) history about the removed records, so a cleared system does not show payments or sign-ins for things that no longer exist
  let history = 0;
  for (const [type, entityIds] of Object.entries(audited)) {
    if (entityIds.length) history += await db.$executeRawUnsafe(`DELETE FROM audit_logs WHERE "entityType" = $1 AND "entityId" = ANY ($2::text[])`, type, entityIds);
  }
  history += await db.$executeRawUnsafe(
    `DELETE FROM activity_logs WHERE "clientId" = ANY ($1::text[]) OR "leadId" = ANY ($2::text[]) OR "projectId" = ANY ($3::text[]) OR "entityId" = ANY ($4::text[])`,
    clientIds, leadIds, projectIds, [...invoiceIds, ...quoteIds, ...contractIds, ...paymentIds],
  );
  if (history) counts["history rows"] = history;

  // Notifications in real people's inboxes and queued/finished jobs that point at removed records (their links carry the ids).
  const removedIds = [...clientIds, ...leadIds, ...projectIds, ...invoiceIds, ...quoteIds, ...contractIds, ...paymentIds];
  const mentions = (col: string) => `EXISTS (SELECT 1 FROM unnest($1::text[]) AS x(id) WHERE ${col} LIKE '%' || x.id || '%')`;
  const notes = await db.$executeRawUnsafe(`DELETE FROM notifications WHERE ${mentions("link")}`, removedIds);
  // "New testimonial from …" links to the CMS list rather than a record id, so match those by author name
  const byAuthor = testimonialAuthors.length
    ? await db.$executeRawUnsafe(`DELETE FROM notifications WHERE type = 'testimonial.submitted' AND EXISTS (SELECT 1 FROM unnest($1::text[]) AS x(n) WHERE title LIKE '%' || x.n || '%')`, testimonialAuthors)
    : 0;
  if (notes + byAuthor) counts["notifications about removed records"] = notes + byAuthor;
  const staleJobs = await db.$executeRawUnsafe(`DELETE FROM jobs WHERE ${mentions("payload::text")} OR payload::text LIKE '%' || $2 || '%'`, [...removedIds, ...emailLogIds], DEMO_DOMAIN);
  if (staleJobs) counts["jobs about removed records"] = staleJobs;

  // Numbering starts again at the beginning once no real document of that kind is left.
  for (const [key, table] of [["invoice", "invoices"], ["quote", "quotes"], ["contract", "contracts"], ["project", "projects"], ["lead-%", "leads"]] as const) {
    const [{ n }] = await db.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*) AS n FROM ${table}`);
    if (Number(n) === 0) await db.$executeRawUnsafe(`DELETE FROM counters WHERE key LIKE $1`, key);
  }

  // 4) emails and jobs generated for demo addresses (including the addresses of the removed demo users)
  const emails = await db.emailLog.deleteMany({ where: { OR: [{ toEmail: { endsWith: DEMO_DOMAIN } }, { toEmail: { in: demoUsers.map((u) => u.email) } }] } });
  await db.auditLog.deleteMany({ where: { message: { contains: DEMO_DOMAIN } } }).catch(() => {});

  const removed = Object.entries(counts).filter(([, n]) => n > 0);
  console.log(`\nDemo data removed ✔  (${removed.map(([k, n]) => `${k}: ${n}`).join(", ") || "nothing to remove"}; ${emails.count} demo emails, ${assets.length} stored files)\n`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
