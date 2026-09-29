export interface UploadTarget {
  url: string;
  method: "PUT";
  headers: Record<string, string>;
  expiresAt: string;
}

export interface DownloadOptions {
  filename?: string;
  contentType?: string;
  /** true = render in browser (video/image preview); false = force download */
  inline?: boolean;
  expiresSec?: number;
}

/**
 * Object-storage abstraction. Media never touches Postgres — the DB stores only `storageKey` + metadata.
 * Browsers upload/download directly against signed URLs; storage credentials never leave the server.
 */
export interface StorageProvider {
  readonly name: string;
  uploadTarget(key: string, opts: { contentType: string; size: number; expiresSec?: number }): Promise<UploadTarget>;
  downloadUrl(key: string, opts?: DownloadOptions): Promise<string>;
  head(key: string): Promise<{ size: number } | null>;
  remove(key: string): Promise<void>;
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  read(key: string, maxBytes?: number): Promise<Buffer>;
  /** The first `bytes` bytes of an object (for content sniffing) without reading the rest. */
  readHead(key: string, bytes?: number): Promise<Buffer>;
}
