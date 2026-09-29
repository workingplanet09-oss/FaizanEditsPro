import { contentDisposition } from "../http";
import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "../env";
import type { DownloadOptions, StorageProvider, UploadTarget } from "./types";

/**
 * S3-compatible provider: AWS S3, Cloudflare R2, Supabase Storage (S3 endpoint), Backblaze B2, MinIO, and
 * Google Cloud Storage via its S3-interoperability endpoint. Configure with STORAGE_* env vars.
 */
export class S3StorageProvider implements StorageProvider {
  readonly name = "s3";
  private client: S3Client;
  private bucket: string;

  constructor() {
    const s = env.storage;
    if (!s.bucket || !s.accessKey || !s.secretKey) throw new Error("S3 storage requires STORAGE_BUCKET, STORAGE_ACCESS_KEY and STORAGE_SECRET_KEY");
    this.bucket = s.bucket;
    this.client = new S3Client({
      region: s.region || "auto",
      endpoint: s.endpoint || undefined,
      forcePathStyle: s.forcePathStyle,
      credentials: { accessKeyId: s.accessKey, secretAccessKey: s.secretKey },
    });
  }

  async uploadTarget(key: string, opts: { contentType: string; size: number; expiresSec?: number }): Promise<UploadTarget> {
    const expiresIn = opts.expiresSec ?? 3600;
    const url = await getSignedUrl(this.client, new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: opts.contentType, ContentLength: opts.size }), { expiresIn });
    return { url, method: "PUT", headers: { "content-type": opts.contentType }, expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString() };
  }

  async downloadUrl(key: string, opts: DownloadOptions = {}): Promise<string> {
    const disposition = opts.filename ? contentDisposition(opts.filename, !!opts.inline) : undefined;
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucket, Key: key, ResponseContentDisposition: disposition, ResponseContentType: opts.contentType }),
      { expiresIn: opts.expiresSec ?? 3600 },
    );
  }

  async head(key: string) {
    try {
      const r = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return { size: Number(r.ContentLength ?? 0) };
    } catch {
      return null;
    }
  }

  async remove(key: string) {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async put(key: string, body: Buffer, contentType: string) {
    await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }));
  }

  async read(key: string, maxBytes = 50 * 1024 * 1024) {
    const r = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    // Refuse before consuming the body: a multi-gigabyte object must never be pulled into memory just to be rejected.
    if (Number(r.ContentLength ?? 0) > maxBytes) {
      (r.Body as { destroy?: () => void } | undefined)?.destroy?.();
      throw new Error("Object too large to read into memory");
    }
    const bytes = await r.Body!.transformToByteArray();
    if (bytes.length > maxBytes) throw new Error("Object too large to read into memory");
    return Buffer.from(bytes);
  }

  async readHead(key: string, bytes = 512) {
    const r = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key, Range: `bytes=0-${bytes - 1}` }));
    return Buffer.from(await r.Body!.transformToByteArray());
  }
}
