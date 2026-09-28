/**
 * Demo data — clearly fictional, fully removable (`npm run db:clear-demo`).
 *
 * Everything here goes through the SAME services the app uses (quotes → contracts → invoices → payments → uploads →
 * versions → feedback → approval → delivery), so the demo doubles as a smoke test and every screen has believable data.
 * All rows carry isDemo = true. Nothing is created unless you run this script.
 *
 *   npm run db:seed          # once (forms, services, templates, automations)
 *   npm run db:seed:demo     # this script
 *
 * Demo logins (password for all: demo-password-123):
 *   admin@demo.faizaneditspro.test · editor@demo.faizaneditspro.test · client@demo.faizaneditspro.test
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import type { ProjectStatus } from "../src/generated/prisma/client";
import { db } from "../src/server/db";
import { hashPassword } from "../src/server/auth/crypto";
import { createSession } from "../src/server/auth/session";
import { actorFromToken, type Actor } from "../src/server/auth/actor";
import { getStorage } from "../src/server/storage";
import { createClientRecord } from "../src/server/services/clients";
import { applyTransition, assignProject, createProject, markAssetsReady, transitionProject } from "../src/server/services/projects";
import { acceptQuote, createQuote, sendQuote } from "../src/server/services/quotes";
import { sendContract, signContract, getContract } from "../src/server/services/contracts";
import { createInvoice, demoPay, sendInvoice, sweepInvoices } from "../src/server/services/invoices";
import { completeUpload, publishDeliverables, requestUpload } from "../src/server/services/assets";
import { createVersion, addComment, approveVersion, setCommentStatus, submitRevision } from "../src/server/services/reviews";
import { getProjectOnboarding, submitProjectOnboarding } from "../src/server/services/briefs";
import { sendMessage } from "../src/server/services/messages";
import { createTask, updateTask } from "../src/server/services/tasks";
import { addManualTime } from "../src/server/services/time";
import { createRetainer } from "../src/server/services/retainers";
import { createFileRequest } from "../src/server/services/requests";
import { submitTestimonial } from "../src/server/services/testimonials";
import { generateBrief } from "../src/server/services/briefs";
import { DEMO_PASSWORD } from "../src/server/services/auth";
import { scoreLead } from "../src/lib/lead-score";
import { nextNumber } from "../src/server/services/common";
import { BUDGET_RANGES } from "../src/lib/site-defaults";
import { visibleQuestions, type FormDef, type QuestionDef } from "../src/lib/conditions";

const MEDIA = path.join(process.cwd(), "public", "demo");
const DOMAIN = "demo.faizaneditspro.test";
const day = (n: number) => new Date(Date.now() + n * 86_400_000);
const log = (m: string) => console.log(`  ${m}`);

// ───────────────────────────── helpers ─────────────────────────────

const sessions: string[] = [];
async function actorFor(userId: string): Promise<Actor> {
  const s = await createSession(userId, { ip: "127.0.0.1", ua: "seed-demo" });
  const a = await actorFromToken(s.token);
  if (!a) throw new Error("could not build actor");
  sessions.push(a.sessionId);
  return a;
}

const MIME: Record<string, string> = { mp4: "video/mp4", jpg: "image/jpeg", png: "image/png", pdf: "application/pdf", mp3: "audio/mpeg" };
const DURATION: Record<string, number> = { "tour-v1.mp4": 20000, "tour-v2.mp4": 20000, "podcast-clip.mp4": 18000, "launch-explainer.mp4": 16000, "reel.mp4": 12000 };

async function putAsset(actor: Actor, projectId: string, file: string, opts: { purpose?: "asset" | "version" | "deliverable"; folderKey?: string; displayName?: string; label?: string } = {}) {
  const buf = fs.readFileSync(path.join(MEDIA, file));
  const ext = file.split(".").pop()!;
  const r = await requestUpload(actor, "127.0.0.1", { purpose: opts.purpose ?? "asset", projectId, folderKey: opts.folderKey, filename: opts.displayName ?? file, size: buf.length, mimeType: MIME[ext], label: opts.label });
  const row = await db.asset.findUniqueOrThrow({ where: { id: r.asset.id } });
  await getStorage().put(row.storageKey, buf, MIME[ext]);
  const done = await completeUpload(actor, row.id, { durationMs: DURATION[file] });
  await db.asset.update({ where: { id: row.id }, data: { isDemo: true } });
  if (ext === "mp4") {
    const thumb = path.join(MEDIA, file.replace(/\.mp4$/, ".jpg"));
    if (fs.existsSync(thumb)) {
      const key = `${row.storageKey}.thumb.jpg`;
      await getStorage().put(key, fs.readFileSync(thumb), "image/jpeg");
      await db.asset.update({ where: { id: row.id }, data: { thumbnailKey: key } });
    }
  }
  return done;
}

function sample(q: QuestionDef, flavor: string): any {
  switch (q.type) {
    case "SELECT":
    case "RADIO":
      return q.options[0]?.value ?? "x";
    case "MULTI_SELECT":
      return q.options.slice(0, 2).map((o) => o.value);
    case "NUMBER":
    case "CURRENCY":
      return 3;
    case "EMAIL":
      return `hello@${DOMAIN}`;
    case "URL":
      return "https://example.com";
    case "PHONE":
      return "+1 555 010 0100";
    case "DATE":
      return day(14).toISOString().slice(0, 10);
    case "COLOR":
      return "#ff5b2e";
    case "TEXTAREA":
      return flavor;
    default:
      return q.key.includes("name") ? "Working title" : "See notes";
  }
}
function fillRequired(form: FormDef, seed: Record<string, any>, flavor: string, extra: string[]) {
  const answers: Record<string, any> = { ...seed };
  for (let pass = 0; pass < 4; pass++)
    for (const s of form.sections) for (const q of visibleQuestions(form, s, answers, extra)) if (q.required && answers[q.key] === undefined) answers[q.key] = sample(q, flavor);
  return answers;
}

/** Shifts a finished project's history into the past so dashboards, charts and "days ago" labels look lived-in. */
async function backdate(projectId: string, days: number) {
  if (!days) return;
  const iv = `${days} days`;
  const p = await db.project.findUniqueOrThrow({ where: { id: projectId } });
  const q = (sql: string) => db.$executeRawUnsafe(sql, projectId);
  await q(`UPDATE projects SET "createdAt"="createdAt"-interval '${iv}', "startDate"="startDate"-interval '${iv}', "completionDate"="completionDate"-interval '${iv}', "deliveredAt"="deliveredAt"-interval '${iv}'${p.status === "DELIVERED" ? `, "deadline"="deadline"-interval '${iv}'` : ""} WHERE id=$1`);
  await q(`UPDATE project_status_changes SET "createdAt"="createdAt"-interval '${iv}' WHERE "projectId"=$1`);
  await q(`UPDATE activity_logs SET "createdAt"="createdAt"-interval '${iv}' WHERE "projectId"=$1`);
  await q(`UPDATE quotes SET "createdAt"="createdAt"-interval '${iv}', "sentAt"="sentAt"-interval '${iv}', "acceptedAt"="acceptedAt"-interval '${iv}', "viewedAt"="viewedAt"-interval '${iv}' WHERE "projectId"=$1`);
  await q(`UPDATE contracts SET "createdAt"="createdAt"-interval '${iv}', "sentAt"="sentAt"-interval '${iv}', "signedAt"="signedAt"-interval '${iv}' WHERE "projectId"=$1`);
  await q(`UPDATE invoices SET "createdAt"="createdAt"-interval '${iv}', "issuedAt"="issuedAt"-interval '${iv}', "sentAt"="sentAt"-interval '${iv}', "paidAt"="paidAt"-interval '${iv}', "dueDate"="dueDate"-interval '${iv}' WHERE "projectId"=$1`);
  await q(`UPDATE payments SET "createdAt"="createdAt"-interval '${iv}', "paidAt"="paidAt"-interval '${iv}' WHERE "invoiceId" IN (SELECT id FROM invoices WHERE "projectId"=$1)`);
  await q(`UPDATE video_versions SET "createdAt"="createdAt"-interval '${iv}', "releasedAt"="releasedAt"-interval '${iv}', "approvedAt"="approvedAt"-interval '${iv}' WHERE "projectId"=$1`);
  await q(`UPDATE video_comments SET "createdAt"="createdAt"-interval '${iv}', "resolvedAt"="resolvedAt"-interval '${iv}' WHERE "projectId"=$1`);
  await q(`UPDATE assets SET "createdAt"="createdAt"-interval '${iv}' WHERE "projectId"=$1`);
  await q(`UPDATE messages SET "createdAt"="createdAt"-interval '${iv}' WHERE "projectId"=$1`);
  await q(`UPDATE tasks SET "createdAt"="createdAt"-interval '${iv}', "completedAt"="completedAt"-interval '${iv}' WHERE "projectId"=$1`);
  await q(`UPDATE time_entries SET "startedAt"="startedAt"-interval '${iv}', "endedAt"="endedAt"-interval '${iv}', "createdAt"="createdAt"-interval '${iv}' WHERE "projectId"=$1`);
  await db.$executeRawUnsafe(`UPDATE clients SET "createdAt"=LEAST("createdAt","createdAt"-interval '${iv}') WHERE id=$1`, p.clientId);
}

// ───────────────────────────── journey ─────────────────────────────

const STAGES = ["quote", "contract", "payment", "onboarding", "assets", "editing", "revision", "review", "approved", "delivered"] as const;
type Stage = (typeof STAGES)[number];

interface Journey {
  clientId: string;
  clientUserId: string;
  name: string;
  description: string;
  serviceSlug: string;
  projectTypeKey: string;
  stage: Stage;
  amount: number; // per line, USD
  lineDescription: string;
  deadlineDays: number;
  ago: number;
  priority?: "LOW" | "NORMAL" | "HIGH" | "URGENT";
  video?: { v1: string; v2?: string; final?: string };
  assets?: string[];
  comments?: { at: number; text: string }[];
  briefFlavor: string;
  payBalance?: boolean;
  testimonial?: { rating: number; quote: string };
  leadId?: string;
}

interface Crew {
  admin: Actor;
  editor: Actor;
  editor2: Actor;
  pm: Actor;
}

async function runJourney(j: Journey, crew: Crew) {
  const reached = (s: Stage) => STAGES.indexOf(j.stage) >= STAGES.indexOf(s);
  const client = await actorFor(j.clientUserId);
  const service = await db.service.findFirst({ where: { slug: j.serviceSlug } });

  const project = await createProject(crew.pm, {
    clientId: j.clientId,
    name: j.name,
    description: j.description,
    serviceId: service?.id,
    projectTypeKey: j.projectTypeKey,
    priority: j.priority ?? "NORMAL",
    deadline: day(j.deadlineDays),
    managerId: crew.pm.userId,
    leadId: j.leadId,
    isDemo: true,
  });
  const pid = project.id;

  // quote
  const quote = await createQuote(crew.admin, {
    clientId: j.clientId,
    projectId: pid,
    title: j.name,
    items: [{ description: j.lineDescription, quantity: 1, unitPrice: j.amount * 100 }, { description: "Two rounds of revisions + captions", quantity: 1, unitPrice: Math.round(j.amount * 0.15) * 100 }],
    depositPercent: 50,
    notes: "Thanks for choosing us — this quote covers everything listed above. Delivery starts as soon as the deposit clears.",
  });
  await sendQuote(crew.admin, quote.id);
  if ((await db.project.findUniqueOrThrow({ where: { id: pid } })).status === "INQUIRY") await applyTransition(crew.admin, pid, "AWAITING_QUOTE", { quiet: true });
  if (!reached("contract")) return pid;

  await acceptQuote(client, quote.id);
  const contract = await db.contract.findFirstOrThrow({ where: { projectId: pid } });
  await sendContract(crew.admin, contract.id);
  if (!reached("payment")) return pid;

  const c = await getContract(client, contract.id);
  await signContract(client, contract.id, { signerName: client.name, signature: client.name, kind: "typed", accept: true, version: c.currentVersion });
  if (!reached("onboarding")) return pid; // stops at AWAITING_PAYMENT with a deposit invoice sent

  const deposit = await db.invoice.findFirstOrThrow({ where: { projectId: pid, kind: { in: ["DEPOSIT", "FULL"] } } });
  await demoPay(client, deposit.id);
  await assignProject(crew.pm, pid, { managerId: crew.pm.userId, editorIds: [crew.editor.userId], motionDesignerIds: [crew.editor2.userId], reviewerIds: [] });
  if (!reached("assets")) return pid; // ONBOARDING — brief not yet filled

  // client fills the project brief
  const onboarding = await getProjectOnboarding(client, pid);
  const form = (onboarding as any).form as FormDef;
  const scope = ((await db.project.findUniqueOrThrow({ where: { id: pid } })).scope as any) ?? {};
  const answers = fillRequired(form, { project_name: j.name }, j.briefFlavor, scope.categories ?? []);
  await submitProjectOnboarding(client, pid, { answers });

  for (const f of j.assets ?? ["brand-logo.png", "music-bed.mp3", "brand-guidelines.pdf"]) {
    await putAsset(client, pid, f, { folderKey: f.endsWith(".png") || f.endsWith(".pdf") ? "brand-assets" : "raw-footage" });
  }
  if (j.stage === "assets") {
    await createFileRequest(crew.pm, pid, { title: "Raw footage — main camera A", description: "Upload the untouched camera originals (no proxies)." });
    return pid;
  }
  await markAssetsReady(client, pid);
  await applyTransition(crew.pm, pid, "EDITING", { quiet: true }).catch(() => {});
  if (!reached("editing") || !j.video) return pid;
  if (j.stage === "editing") {
    await createTask(crew.pm, { projectId: pid, title: "Assemble rough cut", assigneeId: crew.editor.userId, priority: "HIGH", dueDate: day(2), status: "IN_PROGRESS" });
    await addManualTime(crew.editor, { projectId: pid, minutes: 145, note: "Ingest + sync" });
    return pid;
  }

  // V1
  const v1asset = await putAsset(crew.editor, pid, j.video.v1, { purpose: "version", displayName: `${j.name} V1.mp4` });
  const v1 = await createVersion(crew.editor, pid, { assetId: v1asset.id, durationMs: DURATION[j.video.v1], notes: "First cut — pacing, music and captions in. Colour pass still to come.", release: "client" });
  await addManualTime(crew.editor, { projectId: pid, minutes: 310, note: "Rough cut + first pass" });
  await addManualTime(crew.editor2, { projectId: pid, minutes: 95, note: "Motion titles" });

  const cs = j.comments ?? [
    { at: 3200, text: "Love the opening. Can we tighten the first shot by a second?" },
    { at: 9800, text: "Music is a little loud here — the voice-over gets lost." },
    { at: 15400, text: "Please swap this title card for the brand-blue version." },
  ];
  const created: string[] = [];
  for (const cm of cs) created.push((await addComment(client, v1.id, { timecodeMs: cm.at, comment: cm.text })).id);
  await addComment(crew.editor, v1.id, { timecodeMs: cs[0].at, comment: "On it — trimming and re-timing the cut.", parentId: created[0] });
  const rev = await submitRevision(client, pid, { versionId: v1.id, description: "Thanks — a few small changes, mostly audio balance and the title card.", priority: "NORMAL" });
  if (j.stage === "revision") return pid;

  // V2 answers the revision
  const v2asset = await putAsset(crew.editor, pid, j.video.v2 ?? j.video.v1, { purpose: "version", displayName: `${j.name} V2.mp4` });
  const v2 = await createVersion(crew.editor, pid, { assetId: v2asset.id, durationMs: DURATION[j.video.v2 ?? j.video.v1], notes: "V2 — all notes addressed.", changeSummary: "Trimmed opening, ducked music under VO, swapped title card.", revisionId: (rev as any).id, release: "client" });
  for (const id of created) await setCommentStatus(crew.editor, id, "RESOLVED", "Done in V2.").catch(() => {});
  if (j.stage === "review") {
    await addComment(client, v2.id, { timecodeMs: 12100, comment: "This looks great. Could the lower-third stay up for another second?" });
    return pid;
  }

  // approval → balance invoice → deliverables
  await approveVersion(client, pid, { versionId: v2.id, confirmVersionNumber: v2.versionNumber, notes: "Perfect, thank you!" });
  if (j.stage === "approved") {
    // balance invoice is now issued and left unpaid, so final files stay locked — a real, visible gate
    const bal = await db.invoice.findFirst({ where: { projectId: pid, kind: "BALANCE" } });
    if (bal && !["SENT", "VIEWED"].includes(bal.status)) await sendInvoice(crew.admin, bal.id).catch(() => {});
    await putAsset(crew.admin, pid, j.video.final ?? j.video.v2 ?? j.video.v1, { purpose: "deliverable", label: "Final master — 1080p", displayName: `${j.name} — FINAL.mp4` });
    return pid;
  }
  const bal = await db.invoice.findFirst({ where: { projectId: pid, kind: "BALANCE" } });
  if (bal) {
    if (bal.status === "DRAFT") await sendInvoice(crew.admin, bal.id);
    await demoPay(client, bal.id);
  }
  await putAsset(crew.admin, pid, j.video.final ?? j.video.v2 ?? j.video.v1, { purpose: "deliverable", label: "Final master — 1080p", displayName: `${j.name} — FINAL.mp4` });
  await putAsset(crew.admin, pid, "brand-logo.png", { purpose: "deliverable", label: "Thumbnail / cover", displayName: `${j.name} — cover.png` });
  await publishDeliverables(crew.admin, pid);
  await transitionProject(crew.admin, pid, "DELIVERED", { comment: "Final files delivered" });
  await generateBrief(pid).catch(() => {});
  if (j.testimonial) await submitTestimonial(client, pid, { rating: j.testimonial.rating, quote: j.testimonial.quote, permissionToPublish: true, name: client.name, company: (await db.client.findUnique({ where: { id: j.clientId } }))?.companyName ?? undefined }).catch(() => {});
  return pid;
}

// ───────────────────────────── main ─────────────────────────────

async function main() {
  const ws = await db.workspace.findFirst({ orderBy: { createdAt: "asc" } });
  if (!ws) throw new Error("Run `npm run db:seed` first.");
  if (await db.user.findUnique({ where: { email: `admin@${DOMAIN}` } })) {
    console.log("Demo data is already loaded. Run `npm run db:clear-demo` first if you want to reload it.");
    return;
  }
  const settings = await db.setting.findMany({ where: { workspaceId: ws.id, key: "workflow" } });
  void settings;
  console.log("\nLoading demo data…\n");

  // ── people ──
  const roles = Object.fromEntries((await db.role.findMany()).map((r) => [r.key, r.id]));
  const pw = await hashPassword(DEMO_PASSWORD);
  const mkUser = (name: string, email: string, role: string, staff: boolean) =>
    db.user.create({ data: { workspaceId: ws.id, name, email, passwordHash: pw, isStaff: staff, status: "ACTIVE", emailVerifiedAt: new Date(), isDemo: true, timezone: "UTC", roles: { create: { roleId: roles[role] } } } });
  const uAdmin = await mkUser("Ayesha Khan", `admin@${DOMAIN}`, "super_admin", true);
  const uPm = await mkUser("Sam Rivera", `pm@${DOMAIN}`, "project_manager", true);
  const uEditor = await mkUser("Marco Silva", `editor@${DOMAIN}`, "editor", true);
  const uEditor2 = await mkUser("Priya Nair", `motion@${DOMAIN}`, "motion_designer", true);
  const uJordan = await mkUser("Jordan Ellis", `client@${DOMAIN}`, "client", false);
  const uMia = await mkUser("Mia Chen", `mia@${DOMAIN}`, "client", false);
  const uDevon = await mkUser("Devon Park", `devon@${DOMAIN}`, "client", false);
  const uLena = await mkUser("Lena Novak", `lena@${DOMAIN}`, "client", false);
  const uRobert = await mkUser("Robert Hale", `robert@${DOMAIN}`, "client", false);
  log("people ✓");

  const crew: Crew = { admin: await actorFor(uAdmin.id), pm: await actorFor(uPm.id), editor: await actorFor(uEditor.id), editor2: await actorFor(uEditor2.id) };

  // ── clients ──
  const mk = (u: { id: string; name: string; email: string }, company: string, industry: string, website: string, country: string, tags: string[], status: "ACTIVE" | "ONBOARDING" | "PROSPECT") =>
    createClientRecord({ workspaceId: ws.id, name: u.name, email: u.email, companyName: company, industry, website, country, timezone: "UTC", userId: u.id, status, source: "demo", tags, managerId: uPm.id, isDemo: true });
  const northwind = await mk(uJordan, "Northwind Realty Group", "Real estate", "https://northwind.example", "United States", ["real-estate", "vip"], "ACTIVE");
  const lumen = await mk(uMia, "Lumen Podcast Co.", "Media & podcasts", "https://lumen.example", "United Kingdom", ["podcast"], "ACTIVE");
  const arcadia = await mk(uDevon, "Arcadia Software", "SaaS", "https://arcadia.example", "Canada", ["saas"], "ONBOARDING");
  const pixel = await mk(uLena, "Pixel Forge Studios", "Gaming & creators", "https://pixelforge.example", "Germany", ["gaming", "retainer"], "ACTIVE");
  const meridian = await mk(uRobert, "Meridian Capital Advisors", "Finance", "https://meridian.example", "United Arab Emirates", ["finance"], "PROSPECT");
  log("clients ✓");

  // ── projects (each one lives through the real workflow) ──
  const J: Journey[] = [
    { clientId: northwind.id, clientUserId: uJordan.id, name: "Lakeside Estate — Launch Film", description: "Cinematic 60-second launch film for a lakeside listing, cut for YouTube and Instagram.", serviceSlug: "real-estate-video-editing", projectTypeKey: "real_estate", stage: "delivered", amount: 1800, lineDescription: "Property launch film (60s) — colour, sound design, captions", deadlineDays: -40, ago: 62, video: { v1: "tour-v1.mp4", v2: "tour-v2.mp4" }, briefFlavor: "Warm, aspirational tone. Lead with the lake at golden hour and end on the entrance.", testimonial: { rating: 5, quote: "The launch film brought three offers in the first week. Fast, polished and genuinely easy to work with — the review player made feedback painless." } },
    { clientId: northwind.id, clientUserId: uJordan.id, name: "Harbor View Estate — Listing Tour", description: "Walkthrough tour with drone opener and agent branding for the Harbor View listing.", serviceSlug: "real-estate-video-editing", projectTypeKey: "real_estate", stage: "review", amount: 1400, lineDescription: "Listing tour edit (90s) with agent branding", deadlineDays: 4, ago: 9, priority: "HIGH", video: { v1: "tour-v1.mp4", v2: "tour-v2.mp4" }, briefFlavor: "Bright, clean and modern. Use the agent's blue palette; keep the drone opener under 8 seconds." },
    { clientId: northwind.id, clientUserId: uJordan.id, name: "September Reels Pack (6 shorts)", description: "Six vertical shorts from the September open houses.", serviceSlug: "short-form-video-editing", projectTypeKey: "short_form", stage: "editing", amount: 1100, lineDescription: "Six short-form reels (up to 30s each)", deadlineDays: 6, ago: 5, video: { v1: "reel.mp4" }, briefFlavor: "Fast, punchy, on-beat with bold captions." },
    { clientId: lumen.id, clientUserId: uMia.id, name: "Season Trailer — The Long Signal", description: "90-second season trailer with audiogram-style motion.", serviceSlug: "podcast-editing", projectTypeKey: "podcast", stage: "delivered", amount: 950, lineDescription: "Podcast season trailer (90s)", deadlineDays: -70, ago: 96, video: { v1: "podcast-clip.mp4" }, briefFlavor: "Moody and cinematic; punchy quotes on screen.", testimonial: { rating: 5, quote: "They turned ninety minutes of raw audio into a trailer we are proud of. Communication was excellent from start to finish." } },
    { clientId: lumen.id, clientUserId: uMia.id, name: "Episode 42 — Full Episode + 5 Clips", description: "Full episode edit plus five social clips.", serviceSlug: "podcast-editing", projectTypeKey: "podcast", stage: "revision", amount: 780, lineDescription: "Episode edit + 5 social clips", deadlineDays: 3, ago: 12, priority: "HIGH", video: { v1: "podcast-clip.mp4" }, briefFlavor: "Clean multicam cut, remove filler words, keep energy high." },
    { clientId: arcadia.id, clientUserId: uDevon.id, name: "Product Launch Explainer", description: "60-second animated explainer for the v3 launch.", serviceSlug: "saas-video-editing", projectTypeKey: "saas", stage: "assets", amount: 2600, lineDescription: "Product explainer video (60s) with motion graphics", deadlineDays: 12, ago: 4, briefFlavor: "Crisp, confident SaaS tone. Screens recorded at 4K; brand blue and white." },
    { clientId: pixel.id, clientUserId: uLena.id, name: "Weekly Highlights — Sep wk 4", description: "Weekly gaming highlight reel for the main channel.", serviceSlug: "gaming-content-editing", projectTypeKey: "gaming", stage: "approved", amount: 640, lineDescription: "Weekly highlight video (8–10 min)", deadlineDays: 1, ago: 14, video: { v1: "reel.mp4" }, briefFlavor: "High-energy with meme cuts and loud sound design." },
    { clientId: pixel.id, clientUserId: uLena.id, name: "Channel Trailer Refresh", description: "New 45-second channel trailer.", serviceSlug: "youtube-video-editing", projectTypeKey: "youtube", stage: "payment", amount: 720, lineDescription: "Channel trailer (45s)", deadlineDays: 15, ago: 2, briefFlavor: "Show the personality; fast montage." },
    { clientId: meridian.id, clientUserId: uRobert.id, name: "Q3 Investor Update Video", description: "Executive update video for the Q3 investor briefing.", serviceSlug: "corporate-video-editing", projectTypeKey: "corporate", stage: "quote", amount: 3200, lineDescription: "Investor update video (4 min) with data animations", deadlineDays: 21, ago: 1, briefFlavor: "Sober, credible, data-forward." },
  ];

  const pids: Record<string, string> = {};
  for (const j of J) {
    const pid = await runJourney(j, crew);
    pids[j.name] = pid;
    await backdate(pid, j.ago);
    log(`project ✓  ${j.name}  (${j.stage})`);
  }
  await db.client.update({ where: { id: northwind.id }, data: { createdAt: day(-70), firstTime: false } });
  await db.client.update({ where: { id: lumen.id }, data: { createdAt: day(-100), firstTime: false } });

  // ── retainer for Pixel Forge ──
  const retainer = await createRetainer(crew.admin, { clientId: pixel.id, name: "Creator Growth — monthly", monthlyPrice: 180000, videosIncluded: 4, shortsIncluded: 12, hoursIncluded: 0, turnaroundDays: 3, revisionsIncluded: 2, notes: "Includes a dedicated editor and a 3-day turnaround." });
  log("retainer ✓");

  // ── an overdue invoice so the finance widgets have something real to show ──
  const overdue = await createInvoice(crew.admin, { clientId: pixel.id, items: [{ description: "Creator Growth retainer — August", quantity: 1, unitPrice: 180000 }], dueDate: day(-12), notes: "Retainer billing for August." });
  await sendInvoice(crew.admin, overdue.id);
  await db.invoice.update({ where: { id: overdue.id }, data: { dueDate: day(-12), issuedAt: day(-30), sentAt: day(-30) } });
  await sweepInvoices().catch(() => {});
  void retainer;

  // ── conversations ──
  const north = await db.project.findFirstOrThrow({ where: { name: "Harbor View Estate — Listing Tour" } });
  const client1 = await actorFor(uJordan.id);
  await sendMessage(client1, { projectId: north.id, body: "Hi team — quick question: can the agent's headshot stay on screen a bit longer in the closing card?" });
  await sendMessage(crew.pm, { projectId: north.id, body: "Absolutely, Jordan. Marco will extend it to 4 seconds in the next revision. Anything else you'd like changed while we're in there?" });
  await sendMessage(client1, { projectId: north.id, body: "That's it for now — thank you! The drone opener looks fantastic." });
  const ep = await db.project.findFirstOrThrow({ where: { name: "Episode 42 — Full Episode + 5 Clips" } });
  const mia = await actorFor(uMia.id);
  await sendMessage(mia, { projectId: ep.id, body: "Notes are in the player. The second guest's audio dips around the 10 second mark — is that something you can fix?" });
  await sendMessage(crew.editor, { projectId: ep.id, body: "Yes — I'll re-balance both mics and add a gentle de-esser. V2 will be with you tomorrow." });
  log("messages ✓");

  // ── tasks (some overdue / due today so the dashboards show real urgency) ──
  const t1 = await createTask(crew.pm, { projectId: north.id, title: "QC pass on V2 colour", assigneeId: uEditor.id, priority: "NORMAL", dueDate: day(1), status: "REVIEW" });
  await createTask(crew.pm, { projectId: ep.id, title: "Re-balance guest 2 audio", assigneeId: uEditor.id, priority: "HIGH", dueDate: day(-1) });
  const t3 = await createTask(crew.pm, { projectId: ep.id, title: "Export 5 social clips (9:16)", assigneeId: uEditor2.id, priority: "NORMAL", dueDate: day(2) });
  await createTask(crew.admin, { title: "Send monthly invoices to retainer clients", assigneeId: uAdmin.id, priority: "NORMAL", dueDate: day(0) });
  await createTask(crew.admin, { title: "Follow up with Meridian about the investor quote", assigneeId: uPm.id, priority: "HIGH", dueDate: day(1) });
  await updateTask(crew.editor, t1.id, { status: "REVIEW" }).catch(() => {});
  void t3;
  log("tasks ✓");

  // ── leads (CRM) ──
  const src = Object.fromEntries((await db.leadSource.findMany()).map((s) => [s.key, s.id]));
  const budgetMax = (k: string) => (BUDGET_RANGES.find((b) => b.value === k)?.maxUsd ?? 0) * 100;
  const BUDGET_FIX: Record<string, string> = { "5k_10k": "5000_plus", "10k_plus": "5000_plus", "2k_5k": "2500_5000", "1k_2k": "1000_2500", under_500: "250_500", "500_1k": "500_1000" };
  const year = new Date().getFullYear();
  const L = [
    { name: "Hannah Brooks", email: "hannah@brightpath.example", company: "BrightPath Learning", source: "instagram", lookingFor: "long_form", budget: "5k_10k", type: "business", vol: 8, status: "NEW", desc: "We publish two course videos a week and need a dependable editing partner.", ago: 0.2 },
    { name: "Tomás Herrera", email: "tomas@casaverde.example", company: "Casa Verde Homes", source: "google", lookingFor: "real_estate", budget: "2k_5k", type: "agency", vol: 6, status: "NEW", desc: "Agency with 6 agents; need consistent listing videos.", ago: 0.5 },
    { name: "Yuki Tanaka", email: "yuki@nova.example", company: "Nova Fitness", source: "referral", lookingFor: "short_form", budget: "1k_2k", type: "business", vol: 12, status: "CONTACTED", desc: "Looking for a monthly package of Reels.", ago: 2 },
    { name: "Ben Carter", email: "ben@carter.example", company: "", source: "youtube", lookingFor: "long_form", budget: "under_500", type: "creator", vol: 4, status: "NEW", desc: "New YouTuber, first video needs editing.", ago: 1 },
    { name: "Sofia Rossi", email: "sofia@vela.example", company: "Vela Ventures", source: "linkedin", lookingFor: "corporate", budget: "10k_plus", type: "business", vol: 3, status: "QUALIFIED", desc: "Portfolio company videos for an investor event.", ago: 3 },
    { name: "Omar Haddad", email: "omar@hadad.example", company: "Haddad Group", source: "website", lookingFor: "vsl", budget: "5k_10k", type: "business", vol: 2, status: "QUOTED", desc: "Long-form VSL for a coaching offer.", ago: 6 },
    { name: "Ivy Lambert", email: "ivy@lambert.example", company: "Lambert Studio", source: "email", lookingFor: "motion_graphics", budget: "2k_5k", type: "agency", vol: 5, status: "CALL_SCHEDULED", desc: "Overflow motion work for an agency.", ago: 4 },
    { name: "Kai Andersen", email: "kai@fjord.example", company: "Fjord Games", source: "youtube", lookingFor: "short_form", budget: "1k_2k", type: "creator", vol: 10, status: "LOST", desc: "Chose an in-house editor.", ago: 15, lost: "Hired in-house" },
    { name: "Nadia Volkova", email: "nadia@peak.example", company: "Peak Wellness", source: "advertisement", lookingFor: "ads", budget: "not_sure", type: "business", vol: 0, status: "NEW", desc: "Not sure about budget yet.", ago: 0.1 },
    { name: "Chris Patel", email: "chris@patel.example", company: "Patel Dental", source: "google", lookingFor: "social_media", budget: "500_1k", type: "business", vol: 4, status: "CONTACTED", desc: "Monthly social videos for a dental clinic.", ago: 5 },
  ];
  for (const l of L) {
    l.budget = BUDGET_FIX[l.budget] ?? l.budget;
    const freq = l.vol >= 8 ? "weekly" : l.vol >= 4 ? "few_per_month" : l.vol >= 1 ? "occasionally" : "one_time";
    const scored = scoreLead({ budget: l.budget, client_type: l.type, looking_for: l.lookingFor, company: l.company, website: l.company ? "https://example.com" : "", videos_per_month: l.vol, video_frequency: freq, turnaround: l.ago < 1 ? "rush" : "standard", project_description: l.desc });
    const seq = await nextNumber(ws.id, `lead-${year}`, 0);
    const created = new Date(Date.now() - l.ago * 86_400_000);
    const lead = await db.lead.create({
      data: {
        workspaceId: ws.id, requestCode: `REQ-${year}-${String(seq).padStart(4, "0")}`, name: l.name, email: l.email, company: l.company || undefined, lookingFor: l.lookingFor, projectType: l.lookingFor,
        clientType: l.type, budgetRange: l.budget, budgetMax: budgetMax(l.budget), description: l.desc, answers: { looking_for: l.lookingFor, client_type: l.type, budget: l.budget, videos_per_month: l.vol, project_description: l.desc },
        sourceId: src[l.source], status: l.status as any, score: scored.score, scoreBreakdown: scored.breakdown, temperature: scored.temperature, lostReason: (l as any).lost, isDemo: true, createdAt: created, updatedAt: created,
        assignedToId: l.status === "NEW" ? undefined : uPm.id, lastContactAt: l.status === "NEW" ? undefined : new Date(created.getTime() + 3_600_000), nextFollowUpAt: ["CONTACTED", "QUALIFIED", "QUOTED", "CALL_SCHEDULED"].includes(l.status) ? day(l.ago > 4 ? -1 : 2) : undefined,
      },
    });
    await db.leadActivity.create({ data: { leadId: lead.id, type: "inquiry_submitted", title: "Inquiry submitted", createdAt: created } });
    if (l.status !== "NEW") await db.leadActivity.create({ data: { leadId: lead.id, type: "status_changed", title: `Status changed to ${l.status}`, actorId: uPm.id, createdAt: new Date(created.getTime() + 3_600_000) } });
  }
  // Leads that became today's clients, so the funnel and lead-to-client conversion rate reflect real history.
  const won = [
    { c: northwind, u: uJordan, source: "referral", lookingFor: "real_estate", budget: "2500_5000", type: "business", ago: 75, desc: "Need launch films for new listings." },
    { c: lumen, u: uMia, source: "instagram", lookingFor: "podcast", budget: "1000_2500", type: "creator", ago: 104, desc: "Weekly podcast plus trailers." },
    { c: arcadia, u: uDevon, source: "linkedin", lookingFor: "saas", budget: "5000_plus", type: "business", ago: 9, desc: "Launch explainer for v3." },
    { c: pixel, u: uLena, source: "youtube", lookingFor: "gaming", budget: "1000_2500", type: "creator", ago: 40, desc: "Weekly highlights and a monthly retainer." },
  ];
  for (const w of won) {
    const scored = scoreLead({ budget: w.budget, client_type: w.type, looking_for: w.lookingFor, company: w.c.companyName, website: "https://example.com", videos_per_month: 6, video_frequency: "few_per_month", turnaround: "standard", project_description: w.desc });
    const seq = await nextNumber(ws.id, `lead-${year}`, 0);
    const created = new Date(Date.now() - w.ago * 86_400_000);
    const lead = await db.lead.create({
      data: {
        workspaceId: ws.id, requestCode: `REQ-${year}-${String(seq).padStart(4, "0")}`, name: w.u.name, email: w.u.email, company: w.c.companyName, lookingFor: w.lookingFor, projectType: w.lookingFor,
        clientType: w.type, budgetRange: w.budget, budgetMax: budgetMax(w.budget), description: w.desc, answers: { looking_for: w.lookingFor, client_type: w.type, budget: w.budget, project_description: w.desc },
        sourceId: src[w.source], status: "CONVERTED", score: scored.score, scoreBreakdown: scored.breakdown, temperature: scored.temperature, convertedClientId: w.c.id, assignedToId: uPm.id,
        lastContactAt: new Date(created.getTime() + 3_600_000), isDemo: true, createdAt: created, updatedAt: new Date(created.getTime() + 2 * 86_400_000),
      },
    });
    await db.leadActivity.createMany({ data: [
      { leadId: lead.id, type: "inquiry_submitted", title: "Inquiry submitted", createdAt: created },
      { leadId: lead.id, type: "status_changed", title: "Status changed to QUALIFIED", actorId: uPm.id, createdAt: new Date(created.getTime() + 3_600_000) },
      { leadId: lead.id, type: "converted", title: "Converted to client", actorId: uPm.id, createdAt: new Date(created.getTime() + 2 * 86_400_000) },
    ] });
  }

  // Delivered work took about a week, not zero days, so turnaround analytics have a believable value.
  await db.$executeRawUnsafe(`UPDATE projects SET "startDate" = "deliveredAt" - interval '7 days' WHERE "isDemo" = true AND "deliveredAt" IS NOT NULL`);
  log("leads ✓");

  // ── public website content (all flagged demo, hidden when you clear demo data) ──
  const thumbs = (n: number) => `/demo/work-${n}.jpg`;
  const P = [
    ["Harbor View Estate Tour", "Real Estate", "Northwind Realty", "real_estate", ["YouTube", "Instagram"], "/demo/tour-v1.mp4", 1, true],
    ["Lakeside Launch Film", "Real Estate", "Northwind Realty", "real_estate", ["Instagram"], "/demo/tour-v2.mp4", 2, true],
    ["The Long Signal — Trailer", "Podcast", "Lumen Podcast Co.", "podcast", ["YouTube", "Spotify"], "/demo/podcast-clip.mp4", 3, true],
    ["v3 Launch Explainer", "SaaS", "Arcadia Software", "saas", ["Website", "LinkedIn"], "/demo/launch-explainer.mp4", 4, true],
    ["Friday Night Clips", "Short-form", "Pixel Forge Studios", "short_form", ["TikTok", "YouTube Shorts"], "/demo/reel.mp4", 5, false],
    ["Trail Running Diaries", "YouTube", "Solo Creator", "youtube", ["YouTube"], null, 6, false],
    ["Quarterly Investor Brief", "Corporate", "Meridian Capital", "corporate", ["Website"], null, 7, false],
    ["Spring Collection Ads", "Ads", "Atelier Nord", "ads", ["Meta Ads"], null, 8, false],
    ["Founder Story", "Corporate", "Kestrel Labs", "corporate", ["LinkedIn"], null, 9, false],
    ["Marathon Recap", "Short-form", "Runners Club", "short_form", ["Instagram"], null, 10, false],
  ] as const;
  for (const [i, p] of P.entries()) {
    const slug = p[0].toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    await db.portfolioProject.create({
      data: { workspaceId: ws.id, slug, title: p[0], category: p[1], clientName: p[2], projectType: p[3], platforms: [...p[4]], videoUrl: p[5] ?? undefined, thumbnailUrl: thumbs(p[6]), featured: p[7], sortOrder: i, isDemo: true, description: `A ${p[1].toLowerCase()} edit for ${p[2]} — sample project.`, tags: [p[3]], results: p[7] ? [{ label: "Avg. watch time", value: "+38%" }, { label: "Turnaround", value: "3 days" }] : undefined },
    });
  }
  const pf = await db.portfolioProject.findMany({ where: { workspaceId: ws.id, isDemo: true }, orderBy: { sortOrder: "asc" }, take: 3 });
  const CS = [
    { t: "How Northwind cut listing video turnaround from 2 weeks to 3 days", c: "Northwind Realty Group", i: "Real estate", s: "A regional brokerage needed consistent, premium listing films without hiring in-house." },
    { t: "Turning raw podcast audio into a season trailer", c: "Lumen Podcast Co.", i: "Media", s: "A narrative podcast wanted a cinematic trailer to launch season two." },
    { t: "A launch explainer that lifted trial sign-ups", c: "Arcadia Software", i: "SaaS", s: "Arcadia needed a crisp 60-second explainer for their v3 launch." },
  ];
  for (const [i, c] of CS.entries()) {
    await db.caseStudy.create({
      data: {
        workspaceId: ws.id, portfolioProjectId: pf[i]?.id, slug: c.t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 60), title: c.t, clientName: c.c, industry: c.i, summary: c.s,
        problem: "Video production was slow and inconsistent, with feedback scattered across email and chat.", objective: "A repeatable pipeline: brief → draft → feedback → approval, with predictable turnaround.",
        strategy: "A dedicated editor, a structured brief and timestamped review on every draft.", creativeDirection: "Clean, cinematic, on-brand motion with tasteful sound design.",
        results: [{ label: "Turnaround", value: "3 days" }, { label: "Revision rounds", value: "1.4 avg" }, { label: "Videos / month", value: "12" }], clientFeedback: "The process is what makes it — I always know where my project is.", feedbackAuthor: c.c,
        deliverables: ["Master edit", "Social cut-downs", "Captions"], timeline: "3 weeks", heroImage: thumbs(i + 1), isDemo: true,
      },
    });
  }
  await db.testimonial.updateMany({ where: { isDemo: true }, data: { status: "APPROVED", featured: true } });
  const extraT = [
    { name: "Devon Park", role: "Head of Marketing", company: "Arcadia Software", rating: 5, quote: "Clear communication, sharp edits and zero back-and-forth chaos. It feels like an in-house team." },
    { name: "Lena Novak", role: "Creator", company: "Pixel Forge Studios", rating: 5, quote: "My weekly uploads went from a scramble to a system. The review tool alone is worth it." },
  ];
  for (const t of extraT) await db.testimonial.create({ data: { workspaceId: ws.id, ...t, permissionToPublish: true, status: "APPROVED", featured: true, isDemo: true } });
  const cat = await db.blogCategory.upsert({ where: { workspaceId_slug: { workspaceId: ws.id, slug: "production" } }, create: { workspaceId: ws.id, slug: "production", name: "Production" }, update: {} });
  const BLOG = [
    ["How to brief a video editor so you get it right the first time", "A great brief removes 80% of revision rounds. Here's the exact structure we use with clients."],
    ["Short-form vs long-form: where should your budget go?", "A practical way to decide between Reels and YouTube for your next quarter."],
    ["The anatomy of a great podcast trailer", "Hooks, pacing, sound design and the three shots every trailer needs."],
    ["Revision rounds explained: what counts and what doesn't", "How to give feedback that gets results without burning through your revision allowance."],
  ];
  for (const [i, [title, excerpt]] of BLOG.entries()) {
    await db.blogPost.create({
      data: {
        workspaceId: ws.id, slug: title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 70), title, excerpt, status: "PUBLISHED", publishedAt: day(-(i * 9 + 3)), categoryId: cat.id, authorName: "Ayesha Khan", tags: ["editing", "workflow"], featuredImage: thumbs(i + 1), isDemo: true,
        content: `## ${title}\n\n${excerpt}\n\nThis is **sample content** included with the demo data so the blog is not empty. Replace it from **Admin → Content → Blog**, or remove all demo data with \`npm run db:clear-demo\`.\n\n### Key points\n\n- Start from the outcome, not the tool.\n- Decide what "done" looks like before the first draft.\n- Give timestamped feedback — it's faster for everyone.\n`,
      },
    });
  }
  const PLANS = [
    { name: "Starter", tier: "starter", price: 49900, desc: "One polished video, perfect for launches and one-offs.", videos: 1, rev: 2, feats: ["Up to 3 minutes", "Captions & colour", "2 revision rounds", "5-day turnaround"], hi: false },
    { name: "Growth", tier: "growth", price: 149900, desc: "A steady monthly stream of content with priority turnaround.", videos: 4, rev: 3, feats: ["4 videos or 12 shorts / month", "Dedicated editor", "3 revision rounds", "3-day turnaround"], hi: true, billing: "MONTHLY_RETAINER" as const },
    { name: "Studio", tier: "studio", price: 349900, desc: "A full editing team on call for creators and brands at scale.", videos: 12, rev: 4, feats: ["12 videos or 40 shorts / month", "Motion graphics included", "Priority support", "48-hour turnaround"], hi: false, billing: "MONTHLY_RETAINER" as const },
  ];
  for (const [i, p] of PLANS.entries()) {
    await db.pricingPlan.create({ data: { workspaceId: ws.id, name: p.name, tier: p.tier, description: p.desc, price: p.price, currency: "USD", billingType: p.billing ?? "ONE_TIME", includedVideos: p.videos, includedRevisions: p.rev, features: p.feats, highlighted: p.hi, ctaLabel: "Start a project", sortOrder: i, enabled: true, isDemo: true, captions: true, dedicatedEditor: i > 0 } });
  }
  log("website content ✓");

  // ── tidy: end the temporary sessions we created for seeding ──
  await db.session.deleteMany({ where: { id: { in: sessions } } });
  await db.notification.updateMany({ where: { userId: { in: [uJordan.id, uAdmin.id] }, isDemo: true, createdAt: { lt: day(-2) } }, data: { readAt: new Date() } });

  console.log(`
Demo data loaded ✔

  Sign in at /login (or use the “Demo mode” buttons):
    Admin   admin@${DOMAIN}
    Editor  editor@${DOMAIN}
    Client  client@${DOMAIN}
  Password for every demo account: ${DEMO_PASSWORD}

  Remove it all later:  npm run db:clear-demo
`);
}

main()
  .catch((e) => {
    console.error("\nDemo seed failed:", e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
