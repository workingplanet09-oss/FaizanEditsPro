import type { MeetingStatus, MeetingType, Prisma } from "@/generated/prisma/client";
import { db } from "../db";
import { env } from "../env";
import { AppError, badRequest, notFound } from "../errors";
import { assertCan, type Actor } from "../auth/actor";
import { randomToken } from "../auth/crypto";
import { queueEmail, absoluteUrl } from "../email";
import { emit } from "../events/bus";
import { rateLimit } from "../security/ratelimit";
import { nextNumber } from "./common";
import { notify } from "./notifications";
import { getSetting, getWorkspaceId } from "./settings";
import { formatDateTime } from "@/lib/format";

/**
 * Calendar abstraction: the internal provider works out of the box (a meeting link comes from
 * MEETING_URL_TEMPLATE). Google Calendar / Calendly / Cal.com plug in by implementing this interface.
 */
interface CalendarProvider {
  name: string;
  createMeetingLink(input: { code: string; title: string; startsAt: Date; endsAt: Date }): Promise<string | null>;
}
const internalCalendar: CalendarProvider = {
  name: "internal",
  async createMeetingLink({ code }) {
    return env.calendar.meetingUrlTemplate ? env.calendar.meetingUrlTemplate.replace("{{code}}", code) : null;
  },
};
const getCalendar = (): CalendarProvider => {
  if (env.calendar.provider !== "internal") throw new AppError("NOT_CONFIGURED", `Calendar provider “${env.calendar.provider}” isn't connected yet. Using the internal calendar instead is supported out of the box.`);
  return internalCalendar;
};

export async function availableSlots(input: { type: MeetingType; from?: Date; days?: number }) {
  const ws = await getWorkspaceId();
  const cfg = await getSetting(ws, "booking");
  if (!cfg.enabled) return { enabled: false as const, slots: [] as string[], timezone: cfg.timezone };
  const minutes = cfg.types[input.type]?.minutes ?? cfg.slotMinutes;
  const now = new Date();
  const earliest = new Date(now.getTime() + cfg.minNoticeHours * 3600_000);
  const start = input.from ?? now;
  const horizon = Math.min(input.days ?? cfg.horizonDays, 60);
  const end = new Date(start.getTime() + horizon * 86400_000);
  const booked = await db.meeting.findMany({ where: { workspaceId: ws, status: "SCHEDULED", startsAt: { lt: end }, endsAt: { gt: start } }, select: { startsAt: true, endsAt: true } });
  const slots: string[] = [];
  for (let d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate())); d < end; d = new Date(d.getTime() + 86400_000)) {
    if (!cfg.days.includes(d.getUTCDay())) continue;
    for (let m = cfg.startHour * 60; m + minutes <= cfg.endHour * 60; m += cfg.slotMinutes) {
      const s = new Date(d.getTime() + m * 60_000);
      const e = new Date(s.getTime() + minutes * 60_000);
      if (s < earliest) continue;
      if (booked.some((b) => b.startsAt < e && b.endsAt > s)) continue;
      slots.push(s.toISOString());
    }
  }
  return { enabled: true as const, slots, timezone: cfg.timezone, minutes };
}

export async function bookMeeting(input: { type: MeetingType; startsAt: Date; name: string; email: string; phone?: string; company?: string; notes?: string; timezone?: string; ip: string }) {
  rateLimit(`book:${input.ip}`, 6, 60 * 60_000, "Too many booking attempts. Please try again later.");
  const ws = await getWorkspaceId();
  const cfg = await getSetting(ws, "booking");
  if (!cfg.enabled) throw new AppError("NOT_CONFIGURED", "Online booking is switched off. Please use the contact form.");
  const typeCfg = cfg.types[input.type];
  if (!typeCfg) throw badRequest("Unknown meeting type.");
  const { slots } = await availableSlots({ type: input.type, from: new Date(input.startsAt.getTime() - 86400_000), days: 3 });
  if (!slots.includes(input.startsAt.toISOString())) throw new AppError("CONFLICT", "That time was just taken. Please pick another slot.");
  const endsAt = new Date(input.startsAt.getTime() + typeCfg.minutes * 60_000);
  const email = input.email.trim().toLowerCase();
  const client = await db.client.findFirst({ where: { workspaceId: ws, email } });
  let lead = client ? null : await db.lead.findFirst({ where: { workspaceId: ws, email, status: { notIn: ["LOST", "ARCHIVED", "CONVERTED"] } }, orderBy: { createdAt: "desc" } });
  let leadCreated = false;
  if (!client && !lead) {
    const year = new Date().getFullYear();
    const seq = await nextNumber(ws, `lead-${year}`, 0);
    const source = await db.leadSource.findUnique({ where: { key: "booking" } });
    lead = await db.lead.create({
      data: { workspaceId: ws, requestCode: `REQ-${year}-${String(seq).padStart(4, "0")}`, name: input.name.trim(), email, phone: input.phone, company: input.company, description: input.notes, sourceId: source?.id, status: "CALL_SCHEDULED", temperature: "NEEDS_REVIEW" },
    });
    await db.leadActivity.create({ data: { leadId: lead.id, type: "inquiry_submitted", title: "Booked a discovery call" } });
    leadCreated = true;
  }
  const code = randomToken(6).replace(/[^a-z0-9]/gi, "").toLowerCase().slice(0, 8);
  const meetingUrl = await getCalendar().createMeetingLink({ code, title: typeCfg.label, startsAt: input.startsAt, endsAt });
  const meeting = await db.meeting.create({
    data: { workspaceId: ws, type: input.type, title: `${typeCfg.label} — ${input.name.trim()}`, name: input.name.trim(), email, startsAt: input.startsAt, endsAt, timezone: input.timezone, meetingUrl, notes: input.notes, clientId: client?.id, leadId: lead?.id, status: "SCHEDULED" },
  });
  if (lead) {
    await db.leadActivity.create({ data: { leadId: lead.id, type: "call_scheduled", title: `${typeCfg.label} scheduled for ${formatDateTime(input.startsAt)} UTC`, metadata: { meetingId: meeting.id } } });
    if (["NEW", "CONTACTED"].includes(lead.status)) await db.lead.update({ where: { id: lead.id }, data: { status: "CALL_SCHEDULED" } });
  }
  await queueEmail({ workspaceId: ws, toEmail: email, templateKey: "meeting_booked", vars: { client_name: input.name, meeting_type: typeCfg.label, meeting_time: `${formatDateTime(input.startsAt)} UTC`, meeting_url: meetingUrl ?? absoluteUrl("/contact"), dashboard_url: absoluteUrl("/dashboard") } });
  const staff = await db.user.findMany({ where: { workspaceId: ws, isStaff: true, roles: { some: { role: { key: { in: ["super_admin", "admin", "project_manager"] } } } } }, select: { id: true } });
  await notify({ workspaceId: ws, userIds: staff.map((s) => s.id), category: "SYSTEM", type: "meeting.booked", title: `${typeCfg.label} booked: ${input.name}`, message: `${formatDateTime(input.startsAt)} UTC`, link: "/admin/calendar", email: false });
  if (leadCreated && lead) await emit("lead.created", { workspaceId: ws, leadId: lead.id });
  return { id: meeting.id, startsAt: meeting.startsAt, endsAt: meeting.endsAt, meetingUrl, typeLabel: typeCfg.label };
}

export async function listMeetings(actor: Actor, opts: { from?: Date; to?: Date; status?: string } = {}) {
  assertCan(actor, "leads:read");
  return db.meeting.findMany({
    where: { workspaceId: actor.workspaceId, ...(opts.status ? { status: opts.status as MeetingStatus } : {}), ...(opts.from || opts.to ? { startsAt: { ...(opts.from ? { gte: opts.from } : {}), ...(opts.to ? { lte: opts.to } : {}) } } : {}) },
    orderBy: { startsAt: "asc" },
    take: 300,
    include: { lead: { select: { id: true, name: true } }, client: { select: { id: true, companyName: true } } },
  });
}

export async function createMeeting(actor: Actor, input: { type: MeetingType; title: string; startsAt: Date; minutes?: number; clientId?: string | null; leadId?: string | null; projectId?: string | null; notes?: string }) {
  assertCan(actor, "leads:write");
  const cfg = await getSetting(actor.workspaceId, "booking");
  const minutes = input.minutes ?? cfg.types[input.type]?.minutes ?? 30;
  const endsAt = new Date(input.startsAt.getTime() + minutes * 60_000);
  const code = randomToken(6).replace(/[^a-z0-9]/gi, "").toLowerCase().slice(0, 8);
  const meetingUrl = await getCalendar().createMeetingLink({ code, title: input.title, startsAt: input.startsAt, endsAt });
  const m = await db.meeting.create({ data: { workspaceId: actor.workspaceId, type: input.type, title: input.title, startsAt: input.startsAt, endsAt, meetingUrl, notes: input.notes, clientId: input.clientId ?? undefined, leadId: input.leadId ?? undefined, projectId: input.projectId ?? undefined, hostId: actor.userId } });
  if (input.leadId) await db.leadActivity.create({ data: { leadId: input.leadId, type: "call_scheduled", title: `${input.title} scheduled`, actorId: actor.userId } });
  return m;
}

export async function updateMeeting(actor: Actor, id: string, patch: { status?: MeetingStatus; notes?: string | null; startsAt?: Date }) {
  assertCan(actor, "leads:write");
  const m = await db.meeting.findFirst({ where: { id, workspaceId: actor.workspaceId } });
  if (!m) throw notFound("Meeting");
  const data: Prisma.MeetingUpdateInput = { ...patch };
  if (patch.startsAt) data.endsAt = new Date(patch.startsAt.getTime() + (m.endsAt.getTime() - m.startsAt.getTime()));
  return db.meeting.update({ where: { id }, data });
}
