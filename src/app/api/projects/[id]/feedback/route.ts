import { authRoute, z } from "@/server/api";
import { getFeedbackState, submitTestimonial } from "@/server/services/testimonials";

export const GET = authRoute({}, async ({ actor, params }) => getFeedbackState(actor, params.id));
export const POST = authRoute(
  { body: z.object({ rating: z.number().int().min(1).max(5), quote: z.string().trim().min(10).max(2000), permissionToPublish: z.boolean(), name: z.string().trim().min(2).max(100), role: z.string().max(100).optional(), company: z.string().max(100).optional(), imageUrl: z.string().url().max(500).optional() }), status: 201 },
  async ({ actor, params, body }) => submitTestimonial(actor, params.id, body),
);
