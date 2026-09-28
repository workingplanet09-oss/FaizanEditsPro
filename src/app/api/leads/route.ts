import { authRoute, publicRoute, z } from "@/server/api";
import { submitInquiry, listLeads } from "@/server/services/leads";
import { assertNotSpam } from "@/server/security/spam";
import { AppError } from "@/server/api";

const inquiryBody = z.object({
  answers: z.record(z.string(), z.any()),
  serviceSlug: z.string().max(100).nullish(),
  draftToken: z.string().max(80).nullish(),
  utm: z.object({ source: z.string().max(120).optional(), medium: z.string().max(120).optional(), campaign: z.string().max(120).optional(), term: z.string().max(120).optional(), content: z.string().max(120).optional() }).optional(),
  referrer: z.string().max(400).nullish(),
  referralCode: z.string().max(24).nullish(),
  hp: z.string().optional(),
  t: z.number().optional(),
  turnstile: z.string().optional(),
});

/** POST /api/leads — the Start Project wizard. Public (anti-spam + rate limited); signed-in clients skip contact details. */
export const POST = publicRoute({ body: inquiryBody, status: 201 }, async ({ body, ip, actor }) => {
  await assertNotSpam({ hp: body.hp, t: body.t, turnstile: body.turnstile }, ip, { minMs: 4000 });
  return submitInquiry({ answers: body.answers, serviceSlug: body.serviceSlug, draftToken: body.draftToken, utm: body.utm, referrer: body.referrer, referralCode: body.referralCode, ip, actor });
});

/** GET /api/leads — CRM list (staff). */
export const GET = authRoute(
  { query: z.object({ q: z.string().optional(), section: z.enum(["leads", "prospects", "lost", "converted", "all"]).optional(), status: z.string().optional(), temperature: z.string().optional(), source: z.string().optional(), assignedTo: z.string().optional(), sort: z.string().optional(), page: z.coerce.number().optional(), pageSize: z.coerce.number().optional() }) },
  async ({ actor, query }) => {
    if (!actor.isStaff) throw new AppError("FORBIDDEN", "You don't have permission to do that.");
    return listLeads(actor, query);
  },
);
