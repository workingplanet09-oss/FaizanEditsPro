"use client";

export class ApiError extends Error {
  code: string;
  status: number;
  fields?: Record<string, string>;
  constructor(status: number, code: string, message: string, fields?: Record<string, string>) {
    super(message);
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

function csrfToken(): string {
  if (typeof document === "undefined") return "";
  const m = document.cookie.match(/(?:^|;\s*)fe_csrf=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : "";
}

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  const method = opts.method ?? (opts.body !== undefined ? "POST" : "GET");
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers: { ...(opts.body !== undefined ? { "content-type": "application/json" } : {}), "x-csrf-token": csrfToken() },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: opts.signal,
      credentials: "same-origin",
    });
  } catch (e: any) {
    if (e?.name === "AbortError") throw e;
    throw new ApiError(0, "OFFLINE", "You appear to be offline. Check your connection and try again.");
  }
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.ok) {
    const err = json?.error;
    if (res.status === 401 && typeof window !== "undefined" && !path.startsWith("/api/auth/")) {
      window.location.href = `/login?expired=1&next=${encodeURIComponent(window.location.pathname)}`;
    }
    throw new ApiError(res.status, err?.code ?? "ERROR", err?.message ?? "Something went wrong.", err?.fields);
  }
  return json.data as T;
}

/** Uploads a File straight to a signed URL with progress events (XHR because fetch has no upload progress). */
export function uploadToSignedUrl(
  target: { url: string; method: string; headers: Record<string, string> },
  file: Blob,
  onProgress?: (pct: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(target.method, target.url);
    for (const [k, v] of Object.entries(target.headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? (onProgress?.(100), resolve()) : reject(new ApiError(xhr.status, "UPLOAD_FAILED", "Upload failed. Please try again.")));
    xhr.onerror = () => reject(new ApiError(0, "UPLOAD_FAILED", "Upload failed — check your connection and retry."));
    xhr.onabort = () => reject(new DOMException("Aborted", "AbortError"));
    signal?.addEventListener("abort", () => xhr.abort());
    xhr.send(file);
  });
}
