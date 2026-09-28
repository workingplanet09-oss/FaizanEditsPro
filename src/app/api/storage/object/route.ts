import { contentDisposition } from "@/server/http";
import { NextRequest, NextResponse } from "next/server";
import { createReadStream, createWriteStream, promises as fs } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { verifyPayload } from "@/server/auth/crypto";
import { localPath } from "@/server/storage/local";
import { env } from "@/server/env";

/**
 * Local-provider object endpoint (demo / single-server mode). Access is granted ONLY by a signed, expiring token
 * minted after the caller passed the ownership checks — the key itself is never accepted from the client.
 * Supports HTTP Range so the review player can seek. With S3/R2 storage this route is unused (browsers hit the bucket directly).
 */
type Token = { op: "get" | "put"; k: string; ct?: string; fn?: string; inl?: boolean; max?: number; exp: number };

function verify(req: NextRequest, op: "get" | "put"): Token | NextResponse {
  if (env.storage.provider !== "local") return NextResponse.json({ ok: false, error: { code: "NOT_FOUND", message: "Not found." } }, { status: 404 });
  const t = req.nextUrl.searchParams.get("t") ?? "";
  const tok = verifyPayload<Token>(t, "storage");
  if (!tok || tok.op !== op || tok.exp < Date.now()) return NextResponse.json({ ok: false, error: { code: "FORBIDDEN", message: "This link has expired. Refresh the page and try again." } }, { status: 403 });
  return tok;
}

const SAFE_INLINE = /^(video\/|audio\/|image\/(?!svg)|application\/pdf$)/;

export async function GET(req: NextRequest) {
  const tok = verify(req, "get");
  if (tok instanceof NextResponse) return tok;
  let file: string;
  let size: number;
  try {
    file = localPath(tok.k);
    size = (await fs.stat(file)).size;
  } catch {
    return NextResponse.json({ ok: false, error: { code: "NOT_FOUND", message: "File unavailable." } }, { status: 404 });
  }
  const type = tok.ct && SAFE_INLINE.test(tok.ct) ? tok.ct : tok.ct ?? "application/octet-stream";
  const inline = !!tok.inl && SAFE_INLINE.test(type);
  const name = tok.fn ?? path.basename(file);
  const headers: Record<string, string> = {
    "content-type": type,
    "accept-ranges": "bytes",
    "content-disposition": contentDisposition(name, inline),
    "x-content-type-options": "nosniff",
    "content-security-policy": "sandbox; default-src 'none'",
    "cache-control": "private, max-age=300",
  };
  const range = req.headers.get("range");
  if (range) {
    const m = range.match(/bytes=(\d*)-(\d*)/);
    if (m) {
      let start = m[1] ? parseInt(m[1], 10) : NaN;
      let end = m[2] ? parseInt(m[2], 10) : NaN;
      if (Number.isNaN(start)) { start = Math.max(0, size - end); end = size - 1; }
      else if (Number.isNaN(end) || end >= size) end = size - 1;
      if (start > end || start >= size) return new NextResponse(null, { status: 416, headers: { "content-range": `bytes */${size}` } });
      const stream = Readable.toWeb(createReadStream(file, { start, end })) as unknown as ReadableStream;
      return new NextResponse(stream, { status: 206, headers: { ...headers, "content-range": `bytes ${start}-${end}/${size}`, "content-length": String(end - start + 1) } });
    }
  }
  const stream = Readable.toWeb(createReadStream(file)) as unknown as ReadableStream;
  return new NextResponse(stream, { status: 200, headers: { ...headers, "content-length": String(size) } });
}

export async function HEAD(req: NextRequest) {
  const r = await GET(req);
  return new NextResponse(null, { status: r.status, headers: r.headers });
}

export async function PUT(req: NextRequest) {
  const tok = verify(req, "put");
  if (tok instanceof NextResponse) return tok;
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (!req.body) return NextResponse.json({ ok: false, error: { code: "BAD_REQUEST", message: "Empty upload." } }, { status: 400 });
  if (tok.max && declared > tok.max) return NextResponse.json({ ok: false, error: { code: "BAD_REQUEST", message: "File is larger than declared." } }, { status: 413 });
  const dest = localPath(tok.k);
  await fs.mkdir(path.dirname(dest), { recursive: true });
  const tmp = `${dest}.part-${process.pid}-${Date.now()}`;
  let written = 0;
  try {
    const source = Readable.fromWeb(req.body as any);
    source.on("data", (chunk: Buffer) => {
      written += chunk.length;
      if (tok.max && written > tok.max) source.destroy(new Error("too large"));
    });
    await pipeline(source, createWriteStream(tmp));
    await fs.rename(tmp, dest);
  } catch {
    await fs.rm(tmp, { force: true });
    return NextResponse.json({ ok: false, error: { code: "BAD_REQUEST", message: "Upload failed or exceeded the declared size." } }, { status: 400 });
  }
  return NextResponse.json({ ok: true, data: { size: written } });
}
