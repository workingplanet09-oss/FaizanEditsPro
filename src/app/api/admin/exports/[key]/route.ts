import { NextResponse } from "next/server";
import { authRoute, z } from "@/server/api";
import { runExport } from "@/server/services/exports";

/** CSV / Excel-compatible CSV downloads for leads, clients, projects, invoices, payments, testimonials and reports. */
export const GET = authRoute({ query: z.object({ from: z.coerce.date().optional(), to: z.coerce.date().optional(), excel: z.string().optional() }), rateLimit: { name: "export", limit: 30, windowSec: 600, by: "user" } }, async ({ actor, params, query }) => {
  const r = await runExport(actor, params.key, { from: query.from, to: query.to }, query.excel !== "0");
  return new NextResponse(r.csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${r.filename}"`, "cache-control": "no-store" } });
});
