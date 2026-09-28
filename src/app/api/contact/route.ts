import { publicRoute, z } from "@/server/api";
import { submitContact } from "@/server/services/leads";
import { assertNotSpam } from "@/server/security/spam";

export const POST = publicRoute(
  {
    body: z.object({
      name: z.string().trim().min(2).max(100),
      email: z.string().email().max(200),
      phone: z.string().max(40).optional(),
      company: z.string().max(120).optional(),
      reason: z.enum(["GENERAL", "PROJECT", "PARTNERSHIP", "AGENCY", "CAREER"]),
      message: z.string().trim().min(10, "Tell us a little more (at least 10 characters).").max(4000),
      source: z.string().max(120).optional(),
      utm: z.record(z.string(), z.string().max(120)).optional(),
      hp: z.string().optional(),
      t: z.number().optional(),
      turnstile: z.string().optional(),
    }),
    status: 201,
  },
  async ({ body, ip }) => {
    await assertNotSpam({ hp: body.hp, t: body.t, turnstile: body.turnstile }, ip, { minMs: 2500 });
    const { hp, t, turnstile, ...rest } = body;
    void hp; void t; void turnstile;
    return submitContact({ ...rest, ip });
  },
);
