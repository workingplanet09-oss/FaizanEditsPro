import { env } from "../env";
import { LocalStorageProvider } from "./local";
import { S3StorageProvider } from "./s3";
import type { StorageProvider } from "./types";

const g = globalThis as unknown as { __storage?: StorageProvider };

export function getStorage(): StorageProvider {
  if (!g.__storage) g.__storage = env.storage.provider === "s3" ? new S3StorageProvider() : new LocalStorageProvider();
  return g.__storage;
}

export type { StorageProvider } from "./types";
