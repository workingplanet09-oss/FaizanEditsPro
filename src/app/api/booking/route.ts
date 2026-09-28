import { publicRoute, z } from "@/server/api";
import { bookMeeting } from "@/server/services/booking";
import { assertNotSpam } from "@/server/security/spam";

export const POST = publicRoute(
  { body: z.object({ type: z.enum(["DISCOVERY_CALL", "PROJECT_CONSULTATION", "CLIENT_REVIEW_CALL", "STRATEGY_CALL"]), startsAt: z.coerce.date(), name: z.string().trim().min(2).max(100), email: z.string().email().max(200), phone: z.string().max(40).optional(), company: z.string().max(120).optional(), notes: z.string().max(1500).optional(), timezone: z.string().max(60).optional(), hp: z.string().optional(), t: z.number().optional() }), status: 201 },
  async ({ body, ip }) => {
    await assertNotSpam({ hp: body.hp, t: body.t }, ip, { minMs: 2000 });
    const { hp, t, ...rest } = body;
    void hp; void t;
    return bookMeeting({ ...rest, ip });
  },
);
