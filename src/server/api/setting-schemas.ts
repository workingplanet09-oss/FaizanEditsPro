import { z } from "zod";
import { SETTING_DEFAULTS, type SettingKey } from "@/lib/site-defaults";

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a 6-digit hex color like #FF5B2E");
const link = z.object({ label: z.string().max(60), href: z.string().max(300) });
const url = z.string().max(500).refine((v) => v === "" || /^https?:\/\//i.test(v) || v.startsWith("/"), "Must start with http(s):// or /");

/** Validation per settings group. Unknown groups can't be written at all. */
export const SETTING_SCHEMAS: Record<SettingKey, z.ZodType<any>> = {
  business: z.object({
    name: z.string().trim().min(1).max(80),
    legalName: z.string().max(120),
    taxId: z.string().max(60).default(""),
    tagline: z.string().max(200),
    email: z.string().email().max(200).or(z.literal("")),
    phone: z.string().max(40),
    address: z.string().max(300),
    logoUrl: url,
    faviconUrl: url,
    website: url,
    socials: z.record(z.string(), url),
    defaultCurrency: z.string().length(3).toUpperCase(),
    currencies: z.array(z.string().length(3).toUpperCase()).min(1).max(30),
    timezone: z.string().max(60),
    defaultTurnaround: z.string().max(80),
    revisionPolicy: z.string().max(2000),
  }),
  theme: z.object({ accent: hex, accentContrast: hex }),
  hero: z.object({
    eyebrow: z.string().max(60),
    headline: z.string().min(1).max(160),
    subheadline: z.string().max(400),
    primaryCta: link,
    secondaryCta: link,
    showreelUrl: url,
    posterUrl: url,
    trustPoints: z.array(z.string().max(60)).max(6),
    floatingCards: z.array(z.object({ icon: z.string().max(20), title: z.string().max(40), sub: z.string().max(60) })).max(6),
  }),
  stats: z.object({
    heading: z.string().max(120),
    items: z.array(z.object({ key: z.string().max(30), label: z.string().max(60), mode: z.enum(["auto", "manual", "hidden"]), value: z.string().max(30).optional(), suffix: z.string().max(10).optional() })).max(8),
  }),
  nav: z.object({ links: z.array(link).max(10), loginLabel: z.string().max(30), ctaLabel: z.string().max(30) }),
  footer: z.object({ description: z.string().max(300), columns: z.array(z.object({ title: z.string().max(40), links: z.array(link).max(8) })).max(4), newsletter: z.boolean() }),
  process: z.object({
    heading: z.string().max(160),
    intro: z.string().max(400),
    steps: z.array(z.object({ title: z.string().max(80), summary: z.string().max(200), detail: z.string().max(1000), youDo: z.string().max(300), weDo: z.string().max(300) })).min(1).max(12),
  }),
  about: z.object({
    headline: z.string().max(200),
    story: z.string().max(4000),
    values: z.array(z.object({ title: z.string().max(60), body: z.string().max(300) })).max(8),
    team: z.array(z.object({ name: z.string().max(80), role: z.string().max(80), bio: z.string().max(400).optional(), imageUrl: url.optional() })).max(20),
  }),
  contactInfo: z.object({ heading: z.string().max(120), intro: z.string().max(400), responseTime: z.string().max(80) }),
  legal: z.object({ terms: z.string().max(40000), privacy: z.string().max(40000) }),
  invoice: z.object({ prefix: z.string().trim().min(1).max(8), dueDays: z.number().int().min(0).max(120), notes: z.string().max(1000), paymentInstructions: z.string().max(1000), taxRateBps: z.number().int().min(0).max(10000) }),
  quote: z.object({ prefix: z.string().trim().min(1).max(8), validDays: z.number().int().min(1).max(180), defaultDepositPercent: z.number().int().min(0).max(100), taxRateBps: z.number().int().min(0).max(10000), terms: z.string().max(6000) }),
  workflow: z.object({
    requireInternalReview: z.boolean(),
    requirePaymentBeforeDelivery: z.boolean(),
    autoInvoiceOnContractSigned: z.boolean(),
    rushFeePercent: z.number().int().min(0).max(300),
    referralsEnabled: z.boolean(),
    referralReward: z.string().max(200),
    timeTrackingEnabled: z.boolean(),
    testimonialRequestOnDelivery: z.boolean(),
    maxUploadMb: z.number().int().min(1).max(1024 * 1024),
  }),
  booking: z.object({
    enabled: z.boolean(),
    days: z.array(z.number().int().min(0).max(6)).max(7),
    startHour: z.number().int().min(0).max(23),
    endHour: z.number().int().min(1).max(24),
    slotMinutes: z.number().int().min(10).max(120),
    timezone: z.string().max(60),
    minNoticeHours: z.number().int().min(0).max(240),
    horizonDays: z.number().int().min(1).max(90),
    types: z.record(z.string(), z.object({ label: z.string().max(60), minutes: z.number().int().min(10).max(240), description: z.string().max(200) })),
  }),
  seo: z.object({ titleTemplate: z.string().max(100), defaultDescription: z.string().max(300), ogImage: url }),
  notifications: z.object({ adminEmail: z.string().email().or(z.literal("")) }),
};

export const SETTING_KEYS = Object.keys(SETTING_DEFAULTS) as SettingKey[];
