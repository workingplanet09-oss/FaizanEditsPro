import { db } from "../db";
import { env } from "../env";
import { enqueueJob } from "../jobs/queue";
import { getSettings } from "../services/settings";
import { fillVars, renderEmailHtml, renderEmailText } from "./render";
import { sendViaProvider } from "./providers";

export interface QueueEmailInput {
  workspaceId: string;
  toEmail: string;
  toUserId?: string | null;
  templateKey?: string;
  vars?: Record<string, string | number | null | undefined>;
  /** used when there is no template (or the template is disabled/missing) */
  subject?: string;
  body?: string;
  metadata?: Record<string, string>;
}

export const absoluteUrl = (path: string) => (/^https?:\/\//.test(path) ? path : `${env.appUrl}${path.startsWith("/") ? "" : "/"}${path}`);

/** Renders a template (or the fallback subject/body) into the email log and enqueues delivery. */
export async function queueEmail(input: QueueEmailInput) {
  const { business, theme } = await getSettings(input.workspaceId, ["business", "theme"]);
  const vars = { business_name: business.name, support_email: business.email, ...(input.vars ?? {}) };

  let subject = input.subject ?? "";
  let body = input.body ?? "";
  if (input.templateKey) {
    const tpl = await db.emailTemplate.findUnique({ where: { workspaceId_key: { workspaceId: input.workspaceId, key: input.templateKey } } });
    if (tpl && !tpl.enabled) return null; // admin switched this email off
    if (tpl) {
      subject = tpl.subject;
      body = tpl.body;
    }
  }
  if (!subject || !body) return null;

  const log = await db.emailLog.create({
    data: {
      workspaceId: input.workspaceId,
      toEmail: input.toEmail,
      toUserId: input.toUserId ?? null,
      subject: fillVars(subject, vars),
      body: fillVars(body, vars),
      templateKey: input.templateKey,
      metadata: { ...(input.metadata ?? {}), accent: theme.accent, brand: business.name },
    },
  });
  await enqueueJob("email.send", { emailLogId: log.id });
  return log;
}

/** Job handler: actually delivers a queued email through the configured provider. */
export async function deliverEmail(emailLogId: string) {
  const log = await db.emailLog.findUnique({ where: { id: emailLogId } });
  if (!log || log.status === "SENT") return;
  const meta = (log.metadata ?? {}) as { accent?: string; brand?: string };
  const brand = { name: meta.brand ?? "Studio", accent: meta.accent ?? "#FF5B2E" };
  try {
    const res = await sendViaProvider({
      from: env.email.from,
      to: log.toEmail,
      subject: log.subject,
      html: renderEmailHtml(log.body, brand),
      text: renderEmailText(log.body),
    });
    await db.emailLog.update({ where: { id: log.id }, data: { status: "SENT", provider: res.provider, providerMessageId: res.id, sentAt: new Date(), error: null } });
  } catch (e: any) {
    await db.emailLog.update({ where: { id: log.id }, data: { status: "FAILED", error: String(e?.message ?? e).slice(0, 500) } });
    throw e; // let the queue retry with backoff
  }
}
