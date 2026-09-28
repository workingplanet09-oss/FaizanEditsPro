import { db } from "../db";
import { AppError, badRequest, notFound } from "../errors";
import { assertCan, type Actor } from "../auth/actor";
import { invalidate } from "../cache";
import { audit } from "./audit";
import { RESOURCES, type FieldDef, type ResourceDef } from "@/lib/cms-resources";
import { slugify } from "@/lib/slug";
import { toMinor } from "@/lib/money";

const delegate = (def: ResourceDef) => (db as any)[def.model];

export function getResource(key: string): ResourceDef {
  const def = RESOURCES[key];
  if (!def) throw notFound("Resource");
  return def;
}

const cleanStr = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : v === null || v === undefined ? "" : String(v).trim().slice(0, max));

function isSafeUrl(v: string) {
  return v === "" || /^https?:\/\//i.test(v) || v.startsWith("/");
}

function coerceField(f: FieldDef, raw: unknown, ctx: { currency: string }): unknown {
  switch (f.type) {
    case "text":
    case "icon":
    case "select": {
      const s = cleanStr(raw, 300);
      if (f.type === "select" && s && f.options && !f.options.some((o) => o.value === s)) throw badRequest(`Choose a valid option for ${f.label}.`, { [f.key]: "Invalid option." });
      return s === "" ? (f.required ? "" : null) : s;
    }
    case "textarea": {
      const s = cleanStr(raw, 5000);
      return s === "" ? (f.required ? "" : null) : s;
    }
    case "markdown": {
      const s = typeof raw === "string" ? raw.slice(0, 80000) : "";
      return s.trim() === "" ? (f.required ? "" : null) : s;
    }
    case "url":
    case "image": {
      const s = cleanStr(raw, 1000);
      if (!isSafeUrl(s)) throw badRequest(`${f.label} must start with http:// or https://`, { [f.key]: "Invalid URL." });
      return s === "" ? null : s;
    }
    case "slug":
      return slugify(cleanStr(raw, 120));
    case "number": {
      if (raw === "" || raw === null || raw === undefined) return null;
      const n = Number(raw);
      if (!Number.isFinite(n)) throw badRequest(`${f.label} must be a number.`, { [f.key]: "Must be a number." });
      return Math.round(n);
    }
    case "money": {
      if (raw === "" || raw === null || raw === undefined) return null;
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0) throw badRequest(`${f.label} must be a positive amount.`, { [f.key]: "Invalid amount." });
      return toMinor(n, ctx.currency);
    }
    case "boolean":
      return raw === true || raw === "true";
    case "relation":
      return raw ? String(raw) : null;
    case "tags":
    case "lines": {
      const arr = Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(f.type === "lines" ? "\n" : ",") : [];
      const out = arr.map((x) => cleanStr(x, 300)).filter(Boolean).slice(0, 100);
      return f.type === "tags" ? [...new Set(out)] : out;
    }
    case "datetime": {
      if (!raw) return null;
      const d = new Date(String(raw));
      if (isNaN(d.getTime())) throw badRequest(`${f.label} isn't a valid date.`, { [f.key]: "Invalid date." });
      return d;
    }
    case "metrics": {
      if (!raw || typeof raw !== "object") return null;
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
        const val = cleanStr(v, 80);
        if (val && k.length <= 40) out[k] = val;
      }
      return Object.keys(out).length ? out : null;
    }
    case "tasklist": {
      const lines = (typeof raw === "string" ? raw : "").split("\n").map((l) => l.replace(/\s+$/, "")).filter((l) => l.trim());
      const tasks: { title: string; subtasks: string[] }[] = [];
      for (const l of lines) {
        const sub = l.match(/^\s*[-–•*]\s+(.*)$/);
        if (sub && tasks.length) tasks[tasks.length - 1].subtasks.push(sub[1].trim().slice(0, 200));
        else tasks.push({ title: l.trim().slice(0, 200), subtasks: [] });
      }
      return tasks.slice(0, 80);
    }
    case "deliverables": {
      const lines = (typeof raw === "string" ? raw : "").split("\n").map((l) => l.trim()).filter(Boolean);
      return lines.slice(0, 40).map((l) => {
        const m = l.match(/^(\d+)\s*[x×]\s*(.+)$/i);
        return m ? { quantity: Number(m[1]), label: m[2].trim().slice(0, 150) } : { quantity: 1, label: l.slice(0, 150) };
      });
    }
  }
}

/** DB row → API shape (tasklist/deliverables become editable text; everything else passes through). */
export function serializeRow(def: ResourceDef, row: any) {
  const out: any = { ...row };
  for (const f of def.fields) {
    if (f.type === "tasklist" && Array.isArray(row[f.key])) out[f.key] = (row[f.key] as { title: string; subtasks?: string[] }[]).map((t) => [t.title, ...(t.subtasks ?? []).map((s) => `- ${s}`)].join("\n")).join("\n");
    if (f.type === "deliverables" && Array.isArray(row[f.key])) out[f.key] = (row[f.key] as { quantity: number; label: string }[]).map((d) => `${d.quantity} x ${d.label}`).join("\n");
    if ((f.type === "lines") && row[f.key] && !Array.isArray(row[f.key])) out[f.key] = [];
  }
  return out;
}

function buildData(def: ResourceDef, input: Record<string, unknown>, opts: { create: boolean; existingCurrency?: string }) {
  const data: Record<string, unknown> = {};
  const currency = String(input.currency ?? opts.existingCurrency ?? "USD").toUpperCase();
  const fields: Record<string, string> = {};
  for (const f of def.fields) {
    if (!(f.key in input)) {
      if (opts.create && f.required && def.defaults?.[f.key] === undefined && f.type !== "slug") fields[f.key] = "Required.";
      continue;
    }
    if (f.readOnlyOnEdit && !opts.create) continue;
    const v = coerceField(f, input[f.key], { currency });
    if (f.required && (v === null || v === "" || (Array.isArray(v) && v.length === 0))) fields[f.key] = "Required.";
    data[f.key] = v;
  }
  if (Object.keys(fields).length) throw new AppError("VALIDATION", "Please check the highlighted fields.", { fields });
  if (opts.create) for (const [k, v] of Object.entries(def.defaults ?? {})) if (!(k in data)) data[k] = v;
  if (def.fields.some((f) => f.key === "slug") && !data.slug && (opts.create || "slug" in input)) {
    const base = slugify(String(data[def.titleField] ?? input[def.titleField] ?? ""));
    if (!base) throw new AppError("VALIDATION", "A slug (or title) is required.", { fields: { slug: "Required." } });
    data.slug = base;
  }
  if ("currency" in data && typeof data.currency === "string") data.currency = data.currency.toUpperCase().slice(0, 3);
  return data;
}

function searchWhere(def: ResourceDef, q?: string) {
  if (!q) return {};
  return { OR: def.searchFields.map((f) => ({ [f]: { contains: q, mode: "insensitive" } })) };
}

export async function cmsList(actor: Actor, resource: string, query: { q?: string; page?: number; pageSize?: number } = {}) {
  const def = getResource(resource);
  assertCan(actor, def.perm);
  const pageSize = Math.min(query.pageSize ?? 25, 200);
  const page = Math.max(query.page ?? 1, 1);
  const where = { workspaceId: actor.workspaceId, ...searchWhere(def, query.q) };
  const [rows, total] = await Promise.all([
    delegate(def).findMany({ where, orderBy: def.orderBy, skip: (page - 1) * pageSize, take: pageSize }),
    delegate(def).count({ where }),
  ]);
  return { items: rows.map((r: any) => serializeRow(def, r)), total, page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)) };
}

export async function cmsGet(actor: Actor, resource: string, id: string) {
  const def = getResource(resource);
  assertCan(actor, def.perm);
  const row = await delegate(def).findFirst({ where: { id, workspaceId: actor.workspaceId } });
  if (!row) throw notFound(def.singular);
  return serializeRow(def, row);
}

function conflictToError(e: any, def: ResourceDef): never {
  if (e?.code === "P2002") throw new AppError("CONFLICT", `That ${def.fields.some((f) => f.key === "slug") ? "URL slug" : "value"} is already in use.`, { fields: { slug: "Already in use." } });
  throw e;
}

async function afterWrite(def: ResourceDef) {
  invalidate("public:");
  invalidate("setting:");
}

export async function cmsCreate(actor: Actor, resource: string, input: Record<string, unknown>) {
  const def = getResource(resource);
  assertCan(actor, def.perm);
  if (def.allowCreate === false) throw new AppError("FORBIDDEN", `New ${def.label.toLowerCase()} can't be created here.`);
  const data = buildData(def, input, { create: true });
  if (def.key === "blog-posts") {
    if (!data.authorName) data.authorName = actor.name;
    if (data.status === "PUBLISHED" && !data.publishedAt) data.publishedAt = new Date();
  }
  if (def.sortable) {
    const max = await delegate(def).aggregate({ where: { workspaceId: actor.workspaceId }, _max: { sortOrder: true } });
    data.sortOrder = (max._max.sortOrder ?? 0) + 10;
  }
  try {
    const row = await delegate(def).create({ data: { ...data, workspaceId: actor.workspaceId } });
    await audit(actor, { workspaceId: actor.workspaceId, action: `${def.key}.created`, entityType: def.key, entityId: row.id, message: `${actor.name} created ${def.singular} “${row[def.titleField]}”` });
    await afterWrite(def);
    return serializeRow(def, row);
  } catch (e) {
    conflictToError(e, def);
  }
}

export async function cmsUpdate(actor: Actor, resource: string, id: string, input: Record<string, unknown>) {
  const def = getResource(resource);
  assertCan(actor, def.perm);
  const existing = await delegate(def).findFirst({ where: { id, workspaceId: actor.workspaceId } });
  if (!existing) throw notFound(def.singular);
  const data = buildData(def, input, { create: false, existingCurrency: existing.currency });
  if (def.key === "blog-posts" && data.status === "PUBLISHED" && !existing.publishedAt && !data.publishedAt) data.publishedAt = new Date();
  try {
    const row = await delegate(def).update({ where: { id }, data });
    await audit(actor, { workspaceId: actor.workspaceId, action: `${def.key}.updated`, entityType: def.key, entityId: id, message: `${actor.name} edited ${def.singular} “${row[def.titleField]}”` });
    await afterWrite(def);
    return serializeRow(def, row);
  } catch (e) {
    conflictToError(e, def);
  }
}

export async function cmsDelete(actor: Actor, resource: string, id: string) {
  const def = getResource(resource);
  assertCan(actor, def.perm);
  if (def.allowDelete === false) throw new AppError("FORBIDDEN", `${def.label} can't be deleted — disable them instead.`);
  const existing = await delegate(def).findFirst({ where: { id, workspaceId: actor.workspaceId } });
  if (!existing) throw notFound(def.singular);
  try {
    await delegate(def).delete({ where: { id } });
  } catch (e: any) {
    if (e?.code === "P2003") throw new AppError("CONFLICT", `This ${def.singular} is in use and can't be deleted. Unpublish or disable it instead.`);
    throw e;
  }
  await audit(actor, { workspaceId: actor.workspaceId, action: `${def.key}.deleted`, entityType: def.key, entityId: id, message: `${actor.name} deleted ${def.singular} “${existing[def.titleField]}”` });
  await afterWrite(def);
  return { ok: true };
}

export async function cmsDuplicate(actor: Actor, resource: string, id: string) {
  const def = getResource(resource);
  assertCan(actor, def.perm);
  const existing = await delegate(def).findFirst({ where: { id, workspaceId: actor.workspaceId } });
  if (!existing) throw notFound(def.singular);
  const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = existing;
  const data: any = { ...rest, [def.titleField]: `${existing[def.titleField]} (copy)` };
  if ("slug" in data) data.slug = `${existing.slug}-copy-${Math.random().toString(36).slice(2, 6)}`;
  if ("published" in data) data.published = false;
  if ("enabled" in data) data.enabled = false;
  if ("status" in data && def.key !== "testimonials") data.status = "DRAFT";
  if (def.key === "blog-posts") data.publishedAt = null;
  if (def.key === "case-studies") data.portfolioProjectId = null;
  const row = await delegate(def).create({ data });
  await afterWrite(def);
  return serializeRow(def, row);
}

export async function cmsReorder(actor: Actor, resource: string, ids: string[]) {
  const def = getResource(resource);
  assertCan(actor, def.perm);
  if (!def.sortable) throw badRequest("This resource can't be reordered.");
  const owned = await delegate(def).count({ where: { id: { in: ids }, workspaceId: actor.workspaceId } });
  if (owned !== ids.length) throw notFound(def.singular);
  await db.$transaction(ids.map((id, i) => delegate(def).update({ where: { id }, data: { sortOrder: (i + 1) * 10 } })));
  await afterWrite(def);
  return { ok: true };
}
