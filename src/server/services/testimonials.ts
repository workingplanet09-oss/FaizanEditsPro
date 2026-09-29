import { db } from "../db";
import { AppError, badRequest, notFound } from "../errors";
import { assertOrgAction, type Actor } from "../auth/actor";
import { randomToken } from "../auth/crypto";
import { emit } from "../events/bus";
import { queueEmail, absoluteUrl } from "../email";
import { notify } from "./notifications";
import { requireProject } from "./projects";
import { logActivity } from "./audit";

/** Triggered on delivery: asks the client how it went. Nothing is published without admin approval. */
export async function requestTestimonial(projectId: string) {
  const project = await db.project.findUnique({ where: { id: projectId }, include: { client: true } });
  if (!project) return null;
  const existing = await db.testimonialRequest.findUnique({ where: { projectId } });
  if (existing) return existing;
  const req = await db.testimonialRequest.create({ data: { workspaceId: project.workspaceId, projectId, clientId: project.clientId, token: randomToken(20) } });
  const members = await db.organizationMember.findMany({ where: { organizationId: project.organizationId, role: { in: ["OWNER", "MANAGER"] } }, select: { userId: true } });
  const link = `/dashboard/projects/${projectId}?tab=feedback`;
  await notify({
    workspaceId: project.workspaceId,
    userIds: members.map((m) => m.userId),
    category: "PROJECT",
    type: "testimonial.requested",
    title: "How was your experience?",
    message: `Tell us about ${project.name} — it takes a minute.`,
    link,
    email: true,
    emailTemplate: "testimonial_request",
    emailVars: { project_name: project.name, project_url: absoluteUrl(link), client_name: project.client.name },
  });
  await logActivity({ system: true, label: "System" }, { workspaceId: project.workspaceId, type: "testimonial.requested", message: "Feedback requested from the client", projectId, clientId: project.clientId, visibility: "INTERNAL" });
  await emit("testimonial.requested", { workspaceId: project.workspaceId, projectId, clientId: project.clientId });
  void queueEmail;
  return req;
}

export async function getFeedbackState(actor: Actor, projectId: string) {
  const project = await requireProject(actor, projectId);
  const [req, submitted, client] = await Promise.all([
    db.testimonialRequest.findUnique({ where: { projectId } }),
    db.testimonial.findFirst({ where: { projectId, workspaceId: actor.workspaceId }, select: { id: true, rating: true, status: true, createdAt: true } }),
    db.client.findUnique({ where: { id: project.clientId }, select: { name: true, companyName: true } }),
  ]);
  return { requested: !!req, submitted: submitted ? { rating: submitted.rating, createdAt: submitted.createdAt } : null, defaults: { name: actor.name, company: client?.companyName ?? "" } };
}

export async function submitTestimonial(actor: Actor, projectId: string, input: { rating: number; quote: string; permissionToPublish: boolean; name: string; role?: string; company?: string; imageUrl?: string }) {
  const project = await requireProject(actor, projectId);
  assertOrgAction(actor, project.organizationId, "message");
  if (!["DELIVERED", "ARCHIVED", "APPROVED"].includes(project.status)) throw new AppError("GATED", "You can share feedback once the project is approved.");
  if (input.rating < 1 || input.rating > 5) throw badRequest("Choose a rating from 1 to 5.", { rating: "Required." });
  if (input.quote.trim().length < 10) throw badRequest("Tell us a little more (at least a sentence).", { quote: "Too short." });
  const dup = await db.testimonial.findFirst({ where: { projectId, workspaceId: actor.workspaceId } });
  if (dup) throw new AppError("CONFLICT", "You've already shared feedback for this project. Thank you!");
  const t = await db.testimonial.create({
    data: { workspaceId: actor.workspaceId, projectId, clientId: project.clientId, rating: input.rating, quote: input.quote.trim().slice(0, 2000), permissionToPublish: input.permissionToPublish, name: input.name.trim().slice(0, 100), role: input.role?.trim().slice(0, 100), company: input.company?.trim().slice(0, 100), imageUrl: input.imageUrl && /^https?:\/\//.test(input.imageUrl) ? input.imageUrl : undefined, status: "PENDING", isDemo: project.isDemo },
  });
  await db.testimonialRequest.updateMany({ where: { projectId }, data: { completedAt: new Date() } });
  const admins = await db.user.findMany({ where: { workspaceId: actor.workspaceId, isStaff: true, roles: { some: { role: { key: { in: ["super_admin", "admin"] } } } } }, select: { id: true } });
  await notify({ workspaceId: actor.workspaceId, userIds: admins.map((a) => a.id), category: "PROJECT", type: "testimonial.submitted", title: `New ${input.rating}★ testimonial from ${input.name}`, message: input.quote.slice(0, 120), link: "/admin/content?r=testimonials", email: false });
  return { id: t.id };
}

export { notFound };
