import type { NotificationCategory, Prisma } from "@/generated/prisma/client";
import { db } from "../db";
import { fillVars } from "../email/render";
import { absoluteUrl } from "../email";
import { notify } from "../services/notifications";
import { getSetting } from "../services/settings";
import { formatDate } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import type { EventPayload } from "./bus";

type Base = "/dashboard" | "/admin" | "/editor";

interface Ctx {
  payload: EventPayload;
  project: Awaited<ReturnType<typeof loadProject>>;
  client: { id: string; name: string; email: string; companyName: string; organizationId: string; userId: string | null } | null;
  lead: { id: string; name: string; email: string; requestCode: string; assignedToId: string | null; company: string | null } | null;
  quote: { id: string; number: string; total: number; currency: string; status: string } | null;
  invoice: { id: string; number: string; total: number; amountPaid: number; currency: string; status: string } | null;
  contract: { id: string; number: string; status: string } | null;
  version: { id: string; label: string } | null;
}

const loadProject = (id: string) =>
  db.project.findUnique({
    where: { id },
    select: { id: true, code: true, name: true, deadline: true, status: true, managerId: true, organizationId: true, clientId: true, priority: true, members: { select: { userId: true, role: true } } },
  });

async function loadContext(p: EventPayload): Promise<Ctx> {
  const project = p.projectId ? await loadProject(p.projectId) : null;
  const clientId = p.clientId ?? project?.clientId;
  const client = clientId ? await db.client.findUnique({ where: { id: clientId }, select: { id: true, name: true, email: true, companyName: true, organizationId: true, userId: true } }) : null;
  const lead = p.leadId ? await db.lead.findUnique({ where: { id: p.leadId }, select: { id: true, name: true, email: true, requestCode: true, assignedToId: true, company: true } }) : null;
  const quote = p.quoteId ? await db.quote.findUnique({ where: { id: p.quoteId }, select: { id: true, number: true, total: true, currency: true, status: true } }) : null;
  const invoice = p.invoiceId ? await db.invoice.findUnique({ where: { id: p.invoiceId }, select: { id: true, number: true, total: true, amountPaid: true, currency: true, status: true } }) : null;
  const contract = p.contractId ? await db.contract.findUnique({ where: { id: p.contractId }, select: { id: true, number: true, status: true } }) : null;
  const version = p.versionId ? await db.videoVersion.findUnique({ where: { id: p.versionId }, select: { id: true, label: true } }) : null;
  return { payload: p, project, client, lead, quote, invoice, contract, version };
}

async function buildVars(ctx: Ctx, base: Base): Promise<Record<string, string>> {
  const { business } = { business: await getSetting(ctx.payload.workspaceId, "business") };
  const d = ctx.payload.data ?? {};
  const amount =
    typeof d.amount === "number"
      ? formatMoney(d.amount, String(d.currency ?? ctx.invoice?.currency ?? "USD"))
      : ctx.invoice
        ? formatMoney(ctx.invoice.total, ctx.invoice.currency)
        : ctx.quote
          ? formatMoney(ctx.quote.total, ctx.quote.currency)
          : "";
  const pid = ctx.project?.id;
  return {
    business_name: business.name,
    client_name: ctx.client?.name ?? ctx.lead?.name ?? "there",
    company: ctx.client?.companyName ?? ctx.lead?.company ?? "",
    project_name: ctx.project?.name ?? String(d.projectName ?? ""),
    project_id: ctx.project?.code ?? "",
    deadline: ctx.project?.deadline ? formatDate(ctx.project.deadline) : "to be confirmed",
    amount,
    invoice_number: ctx.invoice?.number ?? "",
    quote_number: ctx.quote?.number ?? "",
    contract_number: ctx.contract?.number ?? "",
    version_label: ctx.version?.label ?? String(d.versionLabel ?? ""),
    request_code: ctx.lead?.requestCode ?? "",
    lead_name: ctx.lead?.name ?? "",
    status: String(d.toStatusLabel ?? ""),
    detail: String(d.detail ?? ""),
    dashboard_url: absoluteUrl(base),
    project_url: pid ? absoluteUrl(`${base}/projects/${pid}`) : absoluteUrl(base),
    review_url: pid && ctx.version ? absoluteUrl(`${base}/projects/${pid}/review/${ctx.version.id}`) : pid ? absoluteUrl(`${base}/projects/${pid}`) : absoluteUrl(base),
    invoice_url: ctx.invoice ? absoluteUrl(`${base}/invoices/${ctx.invoice.id}`) : absoluteUrl(`${base}/invoices`),
    quote_url: ctx.quote ? absoluteUrl(`${base}/quotes/${ctx.quote.id}`) : absoluteUrl(`${base}/quotes`),
    contract_url: ctx.contract ? absoluteUrl(`${base}/contracts/${ctx.contract.id}`) : absoluteUrl(`${base}/contracts`),
    lead_url: ctx.lead ? absoluteUrl(`/admin/leads/${ctx.lead.id}`) : absoluteUrl("/admin/leads"),
    base,
    project_pid: pid ?? "",
    version_pid: ctx.version?.id ?? "",
    invoice_pid: ctx.invoice?.id ?? "",
    quote_pid: ctx.quote?.id ?? "",
    contract_pid: ctx.contract?.id ?? "",
    lead_pid: ctx.lead?.id ?? "",
  };
}

type RecipientSpec = string; // client | client_billing | manager | editors | team | lead_owner | admins | staff_role:<key>

interface Group {
  base: Base;
  userIds: string[];
}

async function orgUsers(organizationId: string, roles: string[]) {
  const m = await db.organizationMember.findMany({ where: { organizationId, role: { in: roles as any }, user: { status: { not: "SUSPENDED" } } }, select: { userId: true } });
  return m.map((x) => x.userId);
}

async function usersWithRoles(workspaceId: string, roleKeys: string[]) {
  const u = await db.user.findMany({ where: { workspaceId, isStaff: true, status: { not: "SUSPENDED" }, roles: { some: { role: { key: { in: roleKeys } } } } }, select: { id: true } });
  return u.map((x) => x.id);
}

async function resolveRecipients(spec: RecipientSpec, ctx: Ctx): Promise<Group[]> {
  const ws = ctx.payload.workspaceId;
  const groups: Group[] = [];
  const add = (base: Base, ids: (string | null | undefined)[]) => {
    const userIds = ids.filter((x): x is string => !!x);
    if (userIds.length) groups.push({ base, userIds });
  };
  switch (spec) {
    case "client": {
      const orgId = ctx.client?.organizationId ?? ctx.project?.organizationId;
      const ids = orgId ? await orgUsers(orgId, ["OWNER", "MANAGER"]) : [];
      if (!ids.length && ctx.client?.userId) ids.push(ctx.client.userId);
      add("/dashboard", ids);
      break;
    }
    case "client_billing": {
      const orgId = ctx.client?.organizationId ?? ctx.project?.organizationId;
      const ids = orgId ? await orgUsers(orgId, ["OWNER", "BILLING"]) : [];
      if (!ids.length && ctx.client?.userId) ids.push(ctx.client.userId);
      add("/dashboard", ids);
      break;
    }
    case "manager":
      add("/admin", [ctx.project?.managerId]);
      break;
    case "editors":
      add("/editor", ctx.project?.members.filter((m) => m.role !== "MANAGER").map((m) => m.userId) ?? []);
      break;
    case "team":
      add("/editor", [...(ctx.project?.members.map((m) => m.userId) ?? [])]);
      break;
    case "lead_owner":
      add("/admin", [ctx.lead?.assignedToId]);
      break;
    case "admins": {
      const ids = await usersWithRoles(ws, ["super_admin", "admin"]);
      add("/admin", [...ids, ctx.project?.managerId, ctx.lead?.assignedToId]);
      break;
    }
    case "finance":
      add("/admin", await usersWithRoles(ws, ["super_admin", "admin", "finance"]));
      break;
    default:
      if (spec.startsWith("staff_role:")) add("/admin", await usersWithRoles(ws, [spec.slice(11)]));
  }
  return groups;
}

/** Guards for delayed reminders: only fire if the thing is STILL waiting. */
async function guardPasses(onlyIf: string | undefined, ctx: Ctx): Promise<boolean> {
  if (!onlyIf) return true;
  switch (onlyIf) {
    case "invoice_unpaid": {
      if (!ctx.invoice) return false;
      const inv = await db.invoice.findUnique({ where: { id: ctx.invoice.id }, select: { status: true } });
      return !!inv && !["PAID", "CANCELLED"].includes(inv.status);
    }
    case "quote_open": {
      if (!ctx.quote) return false;
      const q = await db.quote.findUnique({ where: { id: ctx.quote.id }, select: { status: true } });
      return !!q && ["SENT", "VIEWED"].includes(q.status);
    }
    case "contract_unsigned": {
      if (!ctx.contract) return false;
      const c = await db.contract.findUnique({ where: { id: ctx.contract.id }, select: { status: true } });
      return !!c && ["SENT", "VIEWED"].includes(c.status);
    }
    case "review_pending": {
      if (!ctx.project) return false;
      const p = await db.project.findUnique({ where: { id: ctx.project.id }, select: { status: true } });
      return !!p && ["CLIENT_REVIEW", "FINAL_REVIEW"].includes(p.status);
    }
    case "lead_untouched": {
      if (!ctx.lead) return false;
      const l = await db.lead.findUnique({ where: { id: ctx.lead.id }, select: { status: true } });
      return !!l && l.status === "NEW";
    }
  }
  return true;
}

export async function runAutomationAction(job: { automationId: string; actionId: string; event: string; payload: EventPayload }) {
  const action = await db.automationAction.findUnique({ where: { id: job.actionId }, include: { automation: true } });
  if (!action || !action.automation.enabled) return;
  const cfg = (action.config ?? {}) as Record<string, any>;
  const ctx = await loadContext(job.payload);
  if (!(await guardPasses(cfg.onlyIf, ctx))) return;

  const ws = job.payload.workspaceId;
  const exclude = cfg.includeActor ? [] : [job.payload.actorId ?? ""];
  const category = (cfg.category ?? "PROJECT") as NotificationCategory;

  try {
    switch (action.type) {
      case "NOTIFICATION":
      case "ADMIN_ALERT":
      case "CLIENT_REMINDER":
      case "EMAIL": {
        const spec = String(cfg.recipient ?? (action.type === "ADMIN_ALERT" ? "admins" : "client"));
        const groups = await resolveRecipients(spec, ctx);
        for (const g of groups) {
          const vars = await buildVars(ctx, g.base);
          const title = fillVars(String(cfg.title ?? ""), vars);
          const message = fillVars(String(cfg.message ?? ""), vars);
          const link = cfg.link ? fillVars(String(cfg.link), vars) : undefined;
          const wantsEmail = action.type === "EMAIL" || action.type === "CLIENT_REMINDER";
          const wantsInApp = action.type !== "EMAIL";
          await notify({
            workspaceId: ws,
            userIds: g.userIds,
            exclude,
            category,
            type: job.event,
            title: title || vars.project_name || job.event,
            message,
            link,
            inApp: wantsInApp,
            email: wantsEmail || !!cfg.alsoEmail,
            emailTemplate: cfg.templateKey,
            emailVars: vars,
          });
        }
        break;
      }
      case "STATUS_UPDATE": {
        if (!ctx.project) return;
        const { transitionProject } = await import("../services/projects");
        await transitionProject({ system: true, label: "Automation" }, ctx.project.id, String(cfg.toStatus) as any, { comment: `Automation “${action.automation.name}”`, workspaceId: ws, quiet: true });
        break;
      }
      case "CREATE_TASK": {
        if (!ctx.project) return;
        const vars = await buildVars(ctx, "/admin");
        const assignee = cfg.assignee === "manager" ? ctx.project.managerId : cfg.assignee === "editor" ? ctx.project.members.find((m) => m.role !== "MANAGER")?.userId : null;
        await db.task.create({
          data: {
            workspaceId: ws,
            projectId: ctx.project.id,
            title: fillVars(String(cfg.taskTitle ?? "Follow up"), vars),
            description: cfg.taskDescription ? fillVars(String(cfg.taskDescription), vars) : undefined,
            assigneeId: assignee ?? undefined,
            priority: (cfg.priority ?? "NORMAL") as any,
            dueDate: cfg.dueInDays ? new Date(Date.now() + Number(cfg.dueInDays) * 86400000) : undefined,
          },
        });
        break;
      }
    }
    await db.automationRun.create({ data: { automationId: action.automationId, event: job.event, entityId: job.payload.projectId ?? job.payload.leadId ?? null, status: "ok" } });
  } catch (e: any) {
    await db.automationRun.create({ data: { automationId: action.automationId, event: job.event, entityId: job.payload.projectId ?? null, status: "error", error: String(e?.message ?? e).slice(0, 400) } });
    throw e;
  }
}

export type { Prisma };
