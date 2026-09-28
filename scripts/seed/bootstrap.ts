import { db } from "../../src/server/db";
import { ALL_PERMISSIONS, PERMISSIONS, ROLE_DEFS } from "../../src/lib/permissions";
import { LEAD_SOURCES } from "../../src/lib/site-defaults";
import { AUTOMATIONS, EMAIL_TEMPLATES, FAQS, KB_ARTICLES, PROJECT_TYPES, SERVICES, TEMPLATES } from "./content-data";
import { CATEGORIES, INQUIRY_QUESTIONS, INQUIRY_SECTIONS, PROJECT_QUESTIONS, PROJECT_SECTIONS, type QSeed } from "./onboarding-data";
import type { Prisma } from "../../src/generated/prisma/client";

const force = process.env.SEED_FORCE === "1";
const log = (m: string) => console.log(`  ${m}`);

/**
 * Idempotent production bootstrap: creates everything the platform needs to function (roles, permissions, forms,
 * email templates, automations, services…). It NEVER overwrites content an admin has edited unless SEED_FORCE=1,
 * and it contains no fake clients, metrics, reviews or prices.
 */
export async function bootstrap(opts: { workspaceName?: string } = {}) {
  console.log("Bootstrapping platform…");
  const ws = await db.workspace.upsert({ where: { slug: "default" }, create: { name: opts.workspaceName ?? "FaizanEdits Pro", slug: "default" }, update: {} });
  const workspaceId = ws.id;
  log(`workspace ${ws.slug}`);

  // ── permissions & roles ──
  for (const key of ALL_PERMISSIONS) {
    const group = key.split(":")[0];
    await db.permission.upsert({ where: { key }, create: { key, description: PERMISSIONS[key], group }, update: { description: PERMISSIONS[key], group } });
  }
  const perms = await db.permission.findMany();
  const pByKey = new Map(perms.map((p) => [p.key, p.id]));
  for (const r of ROLE_DEFS) {
    const role = await db.role.upsert({ where: { key: r.key }, create: { key: r.key, name: r.name, description: r.description, isStaff: r.isStaff, rank: r.rank }, update: { name: r.name, description: r.description, isStaff: r.isStaff, rank: r.rank } });
    const keys = r.permissions === "*" ? ALL_PERMISSIONS : r.permissions;
    // system role→permission map is authoritative for built-in roles
    await db.rolePermission.deleteMany({ where: { roleId: role.id } });
    await db.rolePermission.createMany({ data: keys.map((k) => ({ roleId: role.id, permissionId: pByKey.get(k)! })), skipDuplicates: true });
  }
  log(`${ALL_PERMISSIONS.length} permissions · ${ROLE_DEFS.length} roles`);

  // ── lead sources ──
  for (const s of LEAD_SOURCES) await db.leadSource.upsert({ where: { key: s.key }, create: s, update: { label: s.label } });

  // ── onboarding categories, forms, sections, questions ──
  for (const [i, [key, name]] of CATEGORIES.entries()) await db.onboardingCategory.upsert({ where: { workspaceId_key: { workspaceId, key } }, create: { workspaceId, key, name, sortOrder: i }, update: { name } });
  const cats = await db.onboardingCategory.findMany({ where: { workspaceId } });
  const catId = new Map(cats.map((c) => [c.key, c.id]));

  async function seedForm(key: string, name: string, description: string, sections: typeof INQUIRY_SECTIONS, questions: QSeed[]) {
    const form = await db.onboardingForm.upsert({ where: { workspaceId_key: { workspaceId, key } }, create: { workspaceId, key, name, description }, update: {} });
    const secId = new Map<string, string>();
    for (const [i, s] of sections.entries()) {
      const row = await db.onboardingSection.upsert({ where: { formId_key: { formId: form.id, key: s.key } }, create: { formId: form.id, key: s.key, title: s.title, description: s.description, sortOrder: i }, update: force ? { title: s.title, description: s.description, sortOrder: i } : {} });
      secId.set(s.key, row.id);
    }
    let created = 0;
    for (const [i, s] of questions.entries()) {
      const existing = await db.onboardingQuestion.findUnique({ where: { formId_key: { formId: form.id, key: s.key } } });
      if (existing && !force) continue;
      const data = {
        formId: form.id,
        sectionId: secId.get(s.section)!,
        key: s.key,
        text: s.text,
        helpText: s.help,
        placeholder: s.placeholder,
        type: s.type,
        required: !!s.required,
        conditionalLogic: (s.logic ?? undefined) as Prisma.InputJsonValue | undefined,
        meta: (s.meta ?? undefined) as Prisma.InputJsonValue | undefined,
        sortOrder: (i + 1) * 10,
        active: true,
      };
      if (existing) {
        await db.onboardingOption.deleteMany({ where: { questionId: existing.id } });
        await db.onboardingQuestion.update({ where: { id: existing.id }, data: { ...data, formId: undefined, categories: { set: (s.cats ?? []).map((c) => ({ id: catId.get(c)! })) } } as any });
      }
      const q = existing ?? (await db.onboardingQuestion.create({ data: { ...data, categories: { connect: (s.cats ?? []).map((c) => ({ id: catId.get(c)! })) } } }));
      if (s.options?.length) {
        await db.onboardingOption.createMany({
          data: s.options.map((o, oi) => {
            const arr = typeof o === "string" ? [o, o] : (o as unknown[]);
            return { questionId: q.id, value: String(arr[0]), label: String(arr[1]), categoryKeys: (arr[2] as string[] | undefined) ?? [], icon: (arr[3] as string | undefined) ?? null, description: (arr[4] as string | undefined) ?? null, sortOrder: oi * 10 };
          }),
        });
      }
      created++;
    }
    log(`form “${key}”: ${sections.length} sections · ${questions.length} questions (${created} written)`);
  }
  await seedForm("inquiry", "Project inquiry", "Public Start-a-Project wizard", INQUIRY_SECTIONS, INQUIRY_QUESTIONS);
  await seedForm("project_onboarding", "Project onboarding", "Detailed brief collected after payment", PROJECT_SECTIONS, PROJECT_QUESTIONS);

  // ── email templates ──
  for (const t of EMAIL_TEMPLATES) {
    const existing = await db.emailTemplate.findUnique({ where: { workspaceId_key: { workspaceId, key: t.key } } });
    if (existing && !force) {
      // keep admin edits, but keep the documented variable list current
      await db.emailTemplate.update({ where: { id: existing.id }, data: { variables: t.variables } });
      continue;
    }
    await db.emailTemplate.upsert({ where: { workspaceId_key: { workspaceId, key: t.key } }, create: { workspaceId, ...t }, update: { name: t.name, subject: t.subject, body: t.body, variables: t.variables } });
  }
  log(`${EMAIL_TEMPLATES.length} email templates`);

  // ── automations ──
  let autoCreated = 0;
  for (const a of AUTOMATIONS) {
    const existing = await db.automation.findFirst({ where: { workspaceId, name: a.name } });
    if (existing && !force) continue;
    if (existing) await db.automation.delete({ where: { id: existing.id } });
    await db.automation.create({
      data: { workspaceId, name: a.name, description: a.description, event: a.event, conditions: (a.conditions ?? undefined) as Prisma.InputJsonValue | undefined, enabled: true, isSystem: true, actions: { create: a.actions.map((x, i) => ({ type: x.type, config: x.config as Prisma.InputJsonValue, delayMinutes: x.delayMinutes ?? 0, sortOrder: i })) } },
    });
    autoCreated++;
  }
  log(`${AUTOMATIONS.length} automations (${autoCreated} created)`);

  // ── services ──
  const cat = await db.serviceCategory.upsert({ where: { workspaceId_key: { workspaceId, key: "editing" } }, create: { workspaceId, key: "editing", name: "Video editing", sortOrder: 0 }, update: {} });
  for (const [i, s] of SERVICES.entries()) {
    const existing = await db.service.findUnique({ where: { workspaceId_slug: { workspaceId, slug: s.slug } } });
    if (existing && !force) continue;
    const { slug, ...rest } = s;
    const data = { ...rest, workspaceId, slug, categoryId: cat.id, sortOrder: i * 10, addOns: rest.addOns as unknown as Prisma.InputJsonValue, workflow: rest.workflow as unknown as Prisma.InputJsonValue, priceLabel: "Custom quote", published: true };
    await db.service.upsert({ where: { workspaceId_slug: { workspaceId, slug } }, create: data, update: data });
  }
  log(`${SERVICES.length} services`);

  // ── FAQs & help ──
  if (force || (await db.faq.count({ where: { workspaceId } })) === 0) {
    if (force) await db.faq.deleteMany({ where: { workspaceId } });
    await db.faq.createMany({ data: FAQS.map((f, i) => ({ workspaceId, category: f.category, question: f.question, answer: f.answer, serviceSlugs: f.serviceSlugs ?? [], sortOrder: i * 10, published: true })) });
  }
  for (const [i, a] of KB_ARTICLES.entries()) {
    const existing = await db.kbArticle.findUnique({ where: { workspaceId_slug: { workspaceId, slug: a.slug } } });
    if (!existing) await db.kbArticle.create({ data: { workspaceId, ...a, sortOrder: i * 10 } });
  }
  log(`${FAQS.length} FAQs · ${KB_ARTICLES.length} help articles`);

  // ── project types & templates ──
  for (const [i, t] of PROJECT_TYPES.entries()) {
    await db.projectType.upsert({ where: { workspaceId_key: { workspaceId, key: t.key } }, create: { workspaceId, key: t.key, name: t.name, defaultTurnaroundDays: t.days, defaultRevisionLimit: t.rev, onboardingCategories: t.cats, sortOrder: i * 10 }, update: force ? { name: t.name, defaultTurnaroundDays: t.days, defaultRevisionLimit: t.rev, onboardingCategories: t.cats } : {} });
  }
  for (const t of TEMPLATES) {
    const existing = await db.projectTemplate.findFirst({ where: { workspaceId, name: t.name } });
    if (existing && !force) continue;
    const data = { workspaceId, name: t.name, description: t.description, projectTypeKey: t.projectTypeKey, defaultTurnaroundDays: t.days, defaultRevisionLimit: t.rev, tasks: t.tasks.map((x) => ({ title: x.title, subtasks: x.subtasks ?? [] })) as unknown as Prisma.InputJsonValue, deliverables: t.deliverables as unknown as Prisma.InputJsonValue, requiredAssets: t.requiredAssets };
    if (existing) await db.projectTemplate.update({ where: { id: existing.id }, data });
    else await db.projectTemplate.create({ data });
  }
  log(`${PROJECT_TYPES.length} project types · ${TEMPLATES.length} templates`);

  // ── blog categories ──
  for (const [slug, name] of [["editing-tips", "Editing tips"], ["creator-resources", "Creator resources"], ["video-marketing", "Video marketing"], ["guides", "Guides"], ["case-studies", "Case studies"]] as const) {
    await db.blogCategory.upsert({ where: { workspaceId_slug: { workspaceId, slug } }, create: { workspaceId, slug, name }, update: {} });
  }

  console.log("Bootstrap complete.");
  return { workspaceId };
}
