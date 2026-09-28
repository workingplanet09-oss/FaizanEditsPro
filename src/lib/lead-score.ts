/**
 * Internal lead scoring. NEVER shown to clients — surfaced to staff only as Hot / Warm / Cold / Needs review.
 * Inputs are onboarding answers keyed by stable question keys, so the model keeps working if wording changes.
 */
export type Temperature = "HOT" | "WARM" | "COLD" | "NEEDS_REVIEW";

const BUDGET: Record<string, number> = { under_250: 4, "250_500": 9, "500_1000": 15, "1000_2500": 21, "2500_5000": 26, "5000_plus": 30, not_sure: 8 };
const CLIENT_TYPE: Record<string, number> = { corporate: 12, agency: 12, startup: 9, brand: 9, business: 9, creator: 7, personal_brand: 6, other: 3 };
const COMPLEXITY: Record<string, number> = { vsl: 9, ads: 9, motion_graphics: 9, long_form: 7, real_estate: 6, podcast: 6, video_editing: 6, social_media: 5, short_form: 5, other: 4 };
const FREQUENCY: Record<string, number> = { weekly: 12, ongoing: 12, few_per_month: 9, monthly: 8, occasionally: 3, one_time: 0 };
const URGENCY: Record<string, number> = { rush: 10, standard: 6, flexible: 3 };

export interface ScoreResult {
  score: number;
  breakdown: Record<string, number>;
  temperature: Temperature;
}

export function scoreLead(a: Record<string, any>): ScoreResult {
  const one = (v: unknown) => (Array.isArray(v) ? String(v[0] ?? "") : String(v ?? ""));
  const budgetKey = one(a.budget);
  const volume = Number(a.videos_per_month ?? 0);
  const volumePts = volume >= 20 ? 20 : volume >= 10 ? 16 : volume >= 5 ? 12 : volume >= 2 ? 8 : volume >= 1 ? 4 : 0;
  const breakdown: Record<string, number> = {
    budget: BUDGET[budgetKey] ?? 0,
    volume: volumePts,
    urgency: URGENCY[one(a.turnaround)] ?? 0,
    clientType: CLIENT_TYPE[one(a.client_type)] ?? 0,
    complexity: COMPLEXITY[one(a.looking_for)] ?? 0,
    companySize: (a.company ? 3 : 0) + (a.website ? 3 : 0),
    retainerPotential: FREQUENCY[one(a.video_frequency)] ?? 0,
  };
  const score = Math.min(100, Object.values(breakdown).reduce((s, n) => s + n, 0));
  const descLen = String(a.project_description ?? "").trim().length;
  const thin = (!budgetKey || budgetKey === "not_sure") && (volumePts === 0 || descLen < 60);
  const temperature: Temperature = thin ? "NEEDS_REVIEW" : score >= 62 ? "HOT" : score >= 38 ? "WARM" : "COLD";
  return { score, breakdown, temperature };
}
