import { promises as fs } from "node:fs";
import path from "node:path";
import { env } from "../env";
import { signPayload } from "../auth/crypto";
import type { DownloadOptions, StorageProvider, UploadTarget } from "./types";

export const localRoot = () => path.resolve(/* turbopackIgnore: true */ process.cwd(), env.storage.localDir);

/** Resolves a storage key to a path inside the storage root, refusing traversal. */
export function localPath(key: string): string {
  if (!key || key.includes("\0") || key.split("/").some((seg) => seg === ".." || seg === "")) throw new Error("Invalid storage key");
  const root = localRoot();
  const full = path.resolve(/* turbopackIgnore: true */ root, key);
  if (!full.startsWith(root + path.sep)) throw new Error("Invalid storage key");
  return full;
}

export class LocalStorageProvider implements StorageProvider {
  readonly name = "local";

  async uploadTarget(key: string, opts: { contentType: string; size: number; expiresSec?: number }): Promise<UploadTarget> {
    const exp = Date.now() + (opts.expiresSec ?? 3600) * 1000;
    const t = signPayload({ op: "put", k: key, ct: opts.contentType, max: opts.size, exp }, "storage");
    return { url: `/api/storage/object?t=${t}`, method: "PUT", headers: { "content-type": opts.contentType }, expiresAt: new Date(exp).toISOString() };
  }

  async downloadUrl(key: string, opts: DownloadOptions = {}): Promise<string> {
    const exp = Date.now() + (opts.expiresSec ?? 3600) * 1000;
    const t = signPayload({ op: "get", k: key, fn: opts.filename, ct: opts.contentType, inl: !!opts.inline, exp }, "storage");
    return `/api/storage/object?t=${t}`;
  }

  async head(key: string) {
    try {
      const st = await fs.stat(localPath(key));
      return st.isFile() ? { size: st.size } : null;
    } catch {
      return null;
    }
  }

  async remove(key: string) {
    await fs.rm(localPath(key), { force: true });
  }

  async put(key: string, body: Buffer) {
    const p = localPath(key);
    await fs.mkdir(path.dirname(p), { recursive: true });
    await fs.writeFile(p, body);
  }

  async read(key: string, maxBytes = 50 * 1024 * 1024) {
    const p = localPath(key);
    const st = await fs.stat(p);
    if (st.size > maxBytes) throw new Error("Object too large to read into memory");
    return fs.readFile(p);
  }

  async readHead(key: string, bytes = 512) {
    const fh = await fs.open(localPath(key), "r");
    try {
      const buf = Buffer.alloc(bytes);
      const { bytesRead } = await fh.read(buf, 0, bytes, 0);
      return buf.subarray(0, bytesRead);
    } finally {
      await fh.close();
    }
  }
}
