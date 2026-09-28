import { NextRequest } from "next/server";
import { json, errorResponse } from "@/server/api/handler";
import { getPaymentProvider } from "@/server/payments";
import { handlePaymentWebhook } from "@/server/services/invoices";
import { runWithRequest } from "@/server/request-context";
import { AppError } from "@/server/errors";

/** Signature-verified provider webhook. Raw body is required for HMAC verification, so this bypasses the JSON wrapper. */
export async function POST(req: NextRequest) {
  return runWithRequest({ ip: req.headers.get("x-forwarded-for") ?? undefined }, async () => {
    try {
      const raw = await req.text();
      const event = getPaymentProvider().parseWebhook(raw, req.headers);
      if (!event) throw new AppError("BAD_REQUEST", "Invalid or unsigned webhook.");
      return json(await handlePaymentWebhook(event));
    } catch (e) {
      return errorResponse(e);
    }
  });
}
