/**
 * Project status machine — the single source of truth for labels, tone, client-facing copy and LEGAL TRANSITIONS.
 * The server enforces `TRANSITIONS`; the UI uses the same map to only offer valid next steps.
 */
export const PROJECT_STATUSES = [
  "INQUIRY",
  "AWAITING_QUOTE",
  "AWAITING_CONTRACT",
  "AWAITING_PAYMENT",
  "ONBOARDING",
  "AWAITING_ASSETS",
  "QUEUED",
  "EDITING",
  "INTERNAL_REVIEW",
  "CLIENT_REVIEW",
  "REVISION",
  "FINAL_REVIEW",
  "APPROVED",
  "DELIVERED",
  "ARCHIVED",
  "CANCELLED",
] as const;
export type ProjectStatusKey = (typeof PROJECT_STATUSES)[number];

export type Tone = "neutral" | "info" | "warning" | "success" | "danger" | "accent";
export type PipelineStage = "inquiry" | "payment" | "production" | "review" | "revision" | "delivery" | "closed";

export interface StatusMeta {
  label: string;
  clientLabel: string;
  stage: PipelineStage;
  tone: Tone;
  /** 0-100, drives the progress bar */
  progress: number;
  /** what the client is told is happening */
  clientNow: string;
  /** what happens next / what we need from them */
  clientNext: string;
  /** true when the ball is in the client's court */
  needsClient: boolean;
}

export const STATUS_META: Record<ProjectStatusKey, StatusMeta> = {
  INQUIRY: { label: "Inquiry", clientLabel: "Request received", stage: "inquiry", tone: "neutral", progress: 3, needsClient: false, clientNow: "We've received your request.", clientNext: "We'll review it and prepare a quote." },
  AWAITING_QUOTE: { label: "Awaiting Quote", clientLabel: "Quote in progress", stage: "inquiry", tone: "info", progress: 8, needsClient: false, clientNow: "We're preparing your quote.", clientNext: "You'll be notified as soon as it's ready to review." },
  AWAITING_CONTRACT: { label: "Awaiting Contract", clientLabel: "Contract", stage: "inquiry", tone: "warning", progress: 16, needsClient: true, clientNow: "Your quote is accepted — the agreement is next.", clientNext: "Review and sign the contract to lock in your slot." },
  AWAITING_PAYMENT: { label: "Awaiting Payment", clientLabel: "Payment due", stage: "payment", tone: "warning", progress: 24, needsClient: true, clientNow: "Contract signed. Payment activates your project.", clientNext: "Pay the invoice and your project starts immediately." },
  ONBOARDING: { label: "Onboarding", clientLabel: "Project setup", stage: "production", tone: "accent", progress: 32, needsClient: true, clientNow: "Payment received — your project is active.", clientNext: "Complete the project brief so we edit exactly what you want." },
  AWAITING_ASSETS: { label: "Awaiting Assets", clientLabel: "Upload your files", stage: "production", tone: "warning", progress: 40, needsClient: true, clientNow: "We're ready to start once your files arrive.", clientNext: "Upload your footage and assets, then tell us you're done." },
  QUEUED: { label: "Queued", clientLabel: "In the queue", stage: "production", tone: "info", progress: 46, needsClient: false, clientNow: "Everything is in — your project is queued for an editor.", clientNext: "Editing starts shortly." },
  EDITING: { label: "Editing", clientLabel: "In production", stage: "production", tone: "accent", progress: 58, needsClient: false, clientNow: "Your editor is working on the first draft.", clientNext: "You'll be notified the moment a draft is ready to review." },
  INTERNAL_REVIEW: { label: "Internal Review", clientLabel: "Quality check", stage: "production", tone: "info", progress: 68, needsClient: false, clientNow: "The draft is going through our internal quality check.", clientNext: "It will be released to you right after." },
  CLIENT_REVIEW: { label: "Client Review", clientLabel: "Ready for your review", stage: "review", tone: "warning", progress: 76, needsClient: true, clientNow: "A draft is ready for your review.", clientNext: "Watch it, leave timestamped notes, then approve or request changes." },
  REVISION: { label: "Revision", clientLabel: "Revising", stage: "revision", tone: "accent", progress: 72, needsClient: false, clientNow: "Your feedback is with the editor.", clientNext: "A new version will be uploaded for you to review." },
  FINAL_REVIEW: { label: "Final Review", clientLabel: "Final approval", stage: "review", tone: "warning", progress: 88, needsClient: true, clientNow: "The final cut is ready.", clientNext: "Approve the final version to receive your files." },
  APPROVED: { label: "Approved", clientLabel: "Approved", stage: "delivery", tone: "success", progress: 94, needsClient: false, clientNow: "You approved the final version.", clientNext: "We're preparing your final deliverables." },
  DELIVERED: { label: "Delivered", clientLabel: "Delivered", stage: "delivery", tone: "success", progress: 100, needsClient: false, clientNow: "Your final files are ready to download.", clientNext: "Need another video? Start a new project anytime." },
  ARCHIVED: { label: "Archived", clientLabel: "Archived", stage: "closed", tone: "neutral", progress: 100, needsClient: false, clientNow: "This project is archived.", clientNext: "You can duplicate it to start something similar." },
  CANCELLED: { label: "Cancelled", clientLabel: "Cancelled", stage: "closed", tone: "danger", progress: 0, needsClient: false, clientNow: "This project was cancelled.", clientNext: "Get in touch if you'd like to restart it." },
};

/** Strict machine. Anything not listed here is rejected unless an admin explicitly overrides (audit-logged). */
export const TRANSITIONS: Record<ProjectStatusKey, ProjectStatusKey[]> = {
  INQUIRY: ["AWAITING_QUOTE", "CANCELLED"],
  AWAITING_QUOTE: ["AWAITING_CONTRACT", "CANCELLED"],
  AWAITING_CONTRACT: ["AWAITING_PAYMENT", "AWAITING_QUOTE", "CANCELLED"],
  AWAITING_PAYMENT: ["ONBOARDING", "AWAITING_CONTRACT", "CANCELLED"],
  ONBOARDING: ["AWAITING_ASSETS", "QUEUED", "CANCELLED"],
  AWAITING_ASSETS: ["QUEUED", "ONBOARDING", "CANCELLED"],
  QUEUED: ["EDITING", "AWAITING_ASSETS", "CANCELLED"],
  EDITING: ["INTERNAL_REVIEW", "CLIENT_REVIEW", "AWAITING_ASSETS", "CANCELLED"],
  INTERNAL_REVIEW: ["CLIENT_REVIEW", "EDITING"],
  CLIENT_REVIEW: ["REVISION", "FINAL_REVIEW", "APPROVED"],
  REVISION: ["EDITING", "INTERNAL_REVIEW", "CLIENT_REVIEW"],
  FINAL_REVIEW: ["APPROVED", "REVISION"],
  APPROVED: ["DELIVERED", "REVISION"],
  DELIVERED: ["ARCHIVED", "REVISION"],
  ARCHIVED: ["DELIVERED"],
  CANCELLED: ["INQUIRY", "ARCHIVED"],
};

export const canTransition = (from: ProjectStatusKey, to: ProjectStatusKey) => TRANSITIONS[from]?.includes(to) ?? false;

/** Statuses that count as "production has started" — the brief locks and changes become Change Requests. */
export const PRODUCTION_STARTED: ProjectStatusKey[] = ["EDITING", "INTERNAL_REVIEW", "CLIENT_REVIEW", "REVISION", "FINAL_REVIEW", "APPROVED", "DELIVERED"];
/** Statuses from which a project is considered still open (not finished / dead). */
export const OPEN_STATUSES: ProjectStatusKey[] = PROJECT_STATUSES.filter((s) => !["DELIVERED", "ARCHIVED", "CANCELLED"].includes(s));
/** Statuses in which a project is actively in production for editors. */
export const ACTIVE_PRODUCTION: ProjectStatusKey[] = ["QUEUED", "EDITING", "INTERNAL_REVIEW", "CLIENT_REVIEW", "REVISION", "FINAL_REVIEW"];

export const PIPELINE: { key: PipelineStage; label: string; statuses: ProjectStatusKey[] }[] = [
  { key: "inquiry", label: "Inquiry", statuses: ["INQUIRY", "AWAITING_QUOTE", "AWAITING_CONTRACT"] },
  { key: "payment", label: "Payment", statuses: ["AWAITING_PAYMENT"] },
  { key: "production", label: "Production", statuses: ["ONBOARDING", "AWAITING_ASSETS", "QUEUED", "EDITING", "INTERNAL_REVIEW"] },
  { key: "review", label: "Review", statuses: ["CLIENT_REVIEW", "FINAL_REVIEW"] },
  { key: "revision", label: "Revision", statuses: ["REVISION"] },
  { key: "delivery", label: "Delivery", statuses: ["APPROVED", "DELIVERED"] },
];

/** The 7 visible stages on the client's stepper. */
export const CLIENT_STEPS: { key: string; label: string; statuses: ProjectStatusKey[] }[] = [
  { key: "quote", label: "Quote", statuses: ["INQUIRY", "AWAITING_QUOTE"] },
  { key: "contract", label: "Contract", statuses: ["AWAITING_CONTRACT"] },
  { key: "payment", label: "Payment", statuses: ["AWAITING_PAYMENT"] },
  { key: "setup", label: "Setup", statuses: ["ONBOARDING", "AWAITING_ASSETS", "QUEUED"] },
  { key: "production", label: "Editing", statuses: ["EDITING", "INTERNAL_REVIEW", "REVISION"] },
  { key: "review", label: "Review", statuses: ["CLIENT_REVIEW", "FINAL_REVIEW"] },
  { key: "delivery", label: "Delivery", statuses: ["APPROVED", "DELIVERED", "ARCHIVED"] },
];

export function clientStepIndex(status: ProjectStatusKey): number {
  const i = CLIENT_STEPS.findIndex((s) => s.statuses.includes(status));
  return i === -1 ? 0 : i;
}

export const PRIORITY_META: Record<string, { label: string; tone: Tone; rank: number }> = {
  LOW: { label: "Low", tone: "neutral", rank: 0 },
  NORMAL: { label: "Normal", tone: "info", rank: 1 },
  HIGH: { label: "High", tone: "warning", rank: 2 },
  URGENT: { label: "Urgent", tone: "danger", rank: 3 },
};

export const TASK_STATUS_META: Record<string, { label: string; tone: Tone }> = {
  TODO: { label: "To do", tone: "neutral" },
  IN_PROGRESS: { label: "In progress", tone: "info" },
  REVIEW: { label: "Review", tone: "warning" },
  BLOCKED: { label: "Blocked", tone: "danger" },
  COMPLETE: { label: "Complete", tone: "success" },
};

export const REVISION_STATUS_META: Record<string, { label: string; tone: Tone }> = {
  OPEN: { label: "Open", tone: "warning" },
  IN_PROGRESS: { label: "In progress", tone: "info" },
  RESOLVED: { label: "Resolved", tone: "success" },
  REJECTED: { label: "Rejected", tone: "danger" },
  CLOSED: { label: "Closed", tone: "neutral" },
};

export const QUOTE_STATUS_META: Record<string, { label: string; tone: Tone }> = {
  DRAFT: { label: "Draft", tone: "neutral" },
  SENT: { label: "Sent", tone: "info" },
  VIEWED: { label: "Viewed", tone: "warning" },
  ACCEPTED: { label: "Accepted", tone: "success" },
  REJECTED: { label: "Rejected", tone: "danger" },
  EXPIRED: { label: "Expired", tone: "neutral" },
};

export const INVOICE_STATUS_META: Record<string, { label: string; tone: Tone }> = {
  DRAFT: { label: "Draft", tone: "neutral" },
  SENT: { label: "Sent", tone: "info" },
  VIEWED: { label: "Viewed", tone: "warning" },
  PARTIALLY_PAID: { label: "Partially paid", tone: "warning" },
  PAID: { label: "Paid", tone: "success" },
  OVERDUE: { label: "Overdue", tone: "danger" },
  CANCELLED: { label: "Cancelled", tone: "neutral" },
};

export const CONTRACT_STATUS_META: Record<string, { label: string; tone: Tone }> = {
  DRAFT: { label: "Draft", tone: "neutral" },
  SENT: { label: "Awaiting signature", tone: "warning" },
  VIEWED: { label: "Viewed", tone: "warning" },
  SIGNED: { label: "Signed", tone: "success" },
  DECLINED: { label: "Declined", tone: "danger" },
  VOID: { label: "Void", tone: "neutral" },
};

export const LEAD_STATUS_META: Record<string, { label: string; tone: Tone }> = {
  NEW: { label: "New", tone: "accent" },
  CONTACTED: { label: "Contacted", tone: "info" },
  CALL_SCHEDULED: { label: "Call scheduled", tone: "info" },
  QUALIFIED: { label: "Qualified", tone: "success" },
  QUOTED: { label: "Quoted", tone: "warning" },
  CONVERTED: { label: "Converted", tone: "success" },
  LOST: { label: "Lost", tone: "danger" },
  ARCHIVED: { label: "Archived", tone: "neutral" },
};

export const TEMPERATURE_META: Record<string, { label: string; tone: Tone }> = {
  HOT: { label: "Hot", tone: "danger" },
  WARM: { label: "Warm", tone: "warning" },
  COLD: { label: "Cold", tone: "info" },
  NEEDS_REVIEW: { label: "Needs review", tone: "neutral" },
};

export const CLIENT_STATUS_META: Record<string, { label: string; tone: Tone }> = {
  LEAD: { label: "Lead", tone: "neutral" },
  PROSPECT: { label: "Prospect", tone: "info" },
  ONBOARDING: { label: "Onboarding", tone: "accent" },
  ACTIVE: { label: "Active", tone: "success" },
  RETAINER: { label: "Retainer", tone: "accent" },
  INACTIVE: { label: "Inactive", tone: "warning" },
  ARCHIVED: { label: "Archived", tone: "neutral" },
};

export const RETAINER_STATUS_META: Record<string, { label: string; tone: Tone }> = {
  ACTIVE: { label: "Active", tone: "success" },
  PAUSED: { label: "Paused", tone: "warning" },
  CANCELLED: { label: "Cancelled", tone: "danger" },
  EXPIRED: { label: "Expired", tone: "neutral" },
};
