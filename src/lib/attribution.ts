"use client";

/**
 * First-touch attribution: on the visitor's first page we remember UTM parameters, the referrer and any referral code.
 * They're attached to the lead / contact submission so the CRM knows where each lead came from.
 */
export interface Attribution {
  utm: { source?: string; medium?: string; campaign?: string; term?: string; content?: string };
  referrer: string;
  ref: string;
}

const KEY = "fe-attribution";

export function rememberAttribution() {
  try {
    const url = new URL(window.location.href);
    const utm = {
      source: url.searchParams.get("utm_source") ?? undefined,
      medium: url.searchParams.get("utm_medium") ?? undefined,
      campaign: url.searchParams.get("utm_campaign") ?? undefined,
      term: url.searchParams.get("utm_term") ?? undefined,
      content: url.searchParams.get("utm_content") ?? undefined,
    };
    const ref = url.searchParams.get("ref") ?? "";
    const hasNew = Object.values(utm).some(Boolean) || !!ref;
    const existing = localStorage.getItem(KEY);
    if (existing && !hasNew) return;
    const referrer = document.referrer && !document.referrer.startsWith(window.location.origin) ? document.referrer : "";
    if (!existing || hasNew) localStorage.setItem(KEY, JSON.stringify({ utm, referrer, ref }));
  } catch {
    /* storage blocked — attribution is best-effort */
  }
}

export function captureAttribution(): Attribution {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as Attribution;
  } catch {
    /* ignore */
  }
  return { utm: {}, referrer: "", ref: "" };
}
