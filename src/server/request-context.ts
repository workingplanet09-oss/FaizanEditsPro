import { AsyncLocalStorage } from "node:async_hooks";

export interface RequestMeta {
  ip?: string;
  userAgent?: string;
}
const als = new AsyncLocalStorage<RequestMeta>();

export const runWithRequest = <T>(meta: RequestMeta, fn: () => Promise<T>) => als.run(meta, fn);
export const getRequestMeta = (): RequestMeta => als.getStore() ?? {};
