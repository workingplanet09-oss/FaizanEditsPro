import { NextResponse } from "next/server";
import { authRoute } from "@/server/api";
import { renderContractHtml } from "@/server/services/contracts";

export const GET = authRoute({}, async ({ actor, params }) => {
  const { html, filename } = await renderContractHtml(actor, params.id);
  return new NextResponse(html, { headers: { "content-type": "text/html; charset=utf-8", "content-disposition": `attachment; filename="${filename}"`, "x-content-type-options": "nosniff", "content-security-policy": "default-src 'none'; img-src data:; style-src 'unsafe-inline'" } });
});
