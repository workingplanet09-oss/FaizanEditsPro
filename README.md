# FaizanEdits Pro

A video-editing studio website **and** the platform that runs the business behind it: public marketing site, a smart "Start a Project" intake wizard, CRM and lead scoring, quotes → contracts → invoices → payments, a client portal with a timestamped video review player, an editor workspace, an admin console with a CMS, automations, analytics and an audit log.

Nothing on screen is fabricated. With an empty database every page renders an honest empty state; optional demo data (clearly flagged, removable in one command) shows what a lived-in studio looks like.

---

## Contents

1. [Quick start](#quick-start)
2. [What's in the box](#whats-in-the-box)
3. [Demo data and accounts](#demo-data-and-accounts)
4. [Scripts](#scripts)
5. [Configuration](#configuration)
6. [Architecture](#architecture)
7. [The project workflow](#the-project-workflow)
8. [Roles and permissions](#roles-and-permissions)
9. [Security notes](#security-notes)
10. [Deployment](#deployment)
11. [Backups and restore](#backups-and-restore)
12. [Testing](#testing)
13. [Verification status and known limits](#verification-status-and-known-limits)

---

## Quick start

Requirements: **Node 20.9+** and **PostgreSQL 15+** (Docker is the easiest way to get one).

```bash
cp .env.example .env               # then edit AUTH_SECRET and CRON_SECRET
docker compose up -d db            # Postgres on 127.0.0.1:5432 (skip if you have your own; set DATABASE_URL)
npm install                        # also runs `prisma generate`
npm run db:deploy                  # apply migrations
npm run db:seed                    # roles, settings, intake form, services, email templates, default content
npm run admin:create -- you@yourstudio.com "Your Name"   # prints a generated password (or pass your own as a 3rd arg)
npm run dev                        # http://localhost:3000
```

Want to look around first? Load the demo studio too (optional, removable):

```bash
npm run db:seed:demo
```

Then use the **Demo mode** buttons on `/login`, or the accounts below.

Sign in at `/login`. Staff land in `/admin` (or `/editor`), clients in `/dashboard`.

---

## What's in the box

**Public site** — Home, Services (+ detail pages), Work / portfolio, Case studies, Process, Pricing, About, Blog, FAQ, Contact, Book a call, Help centre, legal pages. Everything is editable from `/admin/content` and `/admin/settings` (no code changes): hero, stats, navigation, footer, brand colour, pricing plans, testimonials, FAQs, SEO defaults. One accent colour drives the whole theme; light and dark modes; sitemap, robots, canonical URLs, Open Graph and JSON-LD.

**Start a Project wizard** — questions live in the database (`/admin/forms`), grouped into sections, with conditional logic ("show only if…"), option-driven question groups per niche (real estate, podcast, gaming, SaaS, ads…), autosave and resume from any device, file/link references, and a review step. Answers are scored (Hot / Warm / Cold / Needs review) — the score is **internal only**, never shown to visitors or clients, and can be overridden by an admin.

**CRM** — leads with source/UTM tracking, temperature, assignment, follow-ups, activity timeline, internal notes, call scheduling, convert-to-client, spam protection (honeypot, timing, rate limit, optional Turnstile).

**Money** — quotes (line items, discount, tax, deposit %, expiry, accept/decline with reason), versioned contracts with typed or drawn e-signature and audit trail, invoices (multi-currency, integer minor units), offline payments, Stripe checkout (or the built-in demo provider), deposit + balance billing tied to quote approval, retainers and recurring invoices, overdue sweeps and reminders.

**Delivery** — 16-status project state machine with payment/approval gating and audited admin overrides; onboarding brief; file manager with folders, tags and comments; version uploads straight to storage; **review player** with timestamped comments, version compare, approve-pinned-to-version, revision rounds and change requests; final delivery is locked until the balance is paid.

**Portals** — Client portal (projects, quotes, contracts, invoices, retainers, files, messages, brand kit, settings), Editor workspace (only assigned projects, tasks, time tracking, revisions), Admin console (dense command centre, ⌘K palette, calendar, tasks, analytics, exports, audit log, email log, team and roles, automations, integrations status).

**Platform** — background jobs (Postgres queue, inline or separate worker), automations (event → conditions → delayed actions), email templates with a delivery log, in-app notifications with preferences, storage abstraction (local signed URLs or S3-compatible), CSV exports, demo data with one-command removal, multi-tenant-ready schema (`workspaceId` everywhere).

---

## Demo data and accounts

`npm run db:seed:demo` runs the **real services** (create project → send quote → accept → sign → pay → …) so the data is consistent rather than hand-inserted. Every row is flagged `isDemo`, and while `DEMO_MODE=true` the site footer carries a demo notice.

| Role | Email | Notes |
| --- | --- | --- |
| Super admin | `admin@demo.faizaneditspro.test` | full access |
| Project manager | `pm@demo.faizaneditspro.test` | |
| Editor | `editor@demo.faizaneditspro.test` | assigned projects only |
| Motion designer | `motion@demo.faizaneditspro.test` | |
| Client | `client@demo.faizaneditspro.test` | Northwind Realty Group |
| More clients | `mia@` · `devon@` · `lena@` · `robert@` `demo.faizaneditspro.test` | different pipeline stages |

Password for every demo account: `demo-password-123`.

Remove everything (rows, generated emails, stored files) at any time:

```bash
npm run db:clear-demo
```

Real data is never touched. It removes rows flagged `isDemo`, anything you created for a demo client while exploring (a quote, an invoice…), history written by demo users, the activity and audit entries about all of those, and — once no real document of that kind remains — restarts invoice, quote, contract and project numbering.

To confirm a cleared system is genuinely empty, create an admin and run `node scripts/qa-empty.mjs <email> <password>`: it visits every public and admin page and fails on errors or broken values such as `NaN`.

---

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` / `build` / `start` | Next.js (Turbopack) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run db:deploy` | Apply migrations (production-safe) |
| `npm run db:migrate` | Create/apply a migration in development |
| `npm run db:seed` | Idempotent bootstrap: roles, permissions, settings, forms, services, templates, content defaults |
| `npm run admin:create -- <email> "<name>" [password]` | Create or reset a super admin |
| `npm run db:seed:demo` / `db:clear-demo` | Load / remove demo data |
| `npm run worker` | Stand-alone background job worker |
| `npm run test:e2e` | 32-step business workflow + security checks against a running app |
| `npm run test:ui` | Browser flows (invoice, contract signing, form builder, automations, version upload) |
| `node scripts/qa-layout.mjs [--dark]` | Overflow / label / heading / console-error sweep at phone, tablet and desktop widths |
| `node scripts/qa-links.mjs` | Signs in as each demo user and opens every link in their real notifications; fails on 404s or links that bounce them to another portal |
| `node scripts/qa-empty.mjs <admin-email> <password>` | On a cleared database: every public and admin page renders without errors or broken values (`NaN`, `undefined`) |
| `TZ_ID=Asia/Karachi node scripts/qa-timezone.mjs` | Loads the portals in a browser set to another time zone and fails on any hydration mismatch |
| `node scripts/qa-axe.mjs [--dark]` | WCAG 2.1 A/AA audit with axe-core (contrast, ARIA, names, landmarks) on the main public, client, admin and editor pages |

`db:reset` (`prisma migrate reset --force`) **destroys all data** — development only.

---

## Configuration

All configuration is environment variables, read in one place (`src/server/env.ts`) and never sent to the browser. Copy `.env.example`; the important ones:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string |
| `AUTH_SECRET` | 32+ random characters. Signs CSRF tokens and storage URLs, encrypts 2FA secrets. **Production refuses to start with a short or placeholder value.** `openssl rand -base64 48` |
| `APP_URL` | Public origin, used in emails, redirects, payment return URLs and cookie flags |
| `DEMO_MODE` | `true` enables demo login buttons and console-only providers. **Set `false` in production** (a warning is logged if it's on) |
| `CRON_SECRET` | Bearer token for `POST /api/cron/run` |
| `JOBS_INLINE` | `true` runs the job loop inside the web process; set `false` and run `npm run worker` for scale |
| `STORAGE_PROVIDER` | `local` (default, `.storage/`) or `s3` — with `STORAGE_BUCKET`, `STORAGE_REGION`, `STORAGE_ENDPOINT`, `STORAGE_ACCESS_KEY`, `STORAGE_SECRET_KEY`, `STORAGE_FORCE_PATH_STYLE`. Works with AWS S3, Cloudflare R2, MinIO, Supabase Storage, GCS interoperability |
| `STORAGE_MAX_UPLOAD_GB` | Per-file cap (default 20) |
| `PAYMENT_PROVIDER` | `demo` or `stripe` — with `PAYMENT_SECRET_KEY`, `PAYMENT_WEBHOOK_SECRET` |
| `EMAIL_PROVIDER` | `console` (logs + stores in the email log), `resend`, `postmark` or `sendgrid` — with `EMAIL_API_KEY`, `EMAIL_FROM` |
| `GOOGLE_CLIENT_ID/SECRET` | Optional "Continue with Google" |
| `TURNSTILE_SECRET_KEY`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Optional bot protection on public forms |
| `SCAN_PROVIDER`, `CLAMAV_URL` | Optional malware scanning of uploads (`none` \| `clamav-http`) |

Business settings that are not secrets (business details, brand colour, quote and invoice defaults, workflow rules such as payment-before-delivery and rush fee, booking hours, SEO, notification defaults…) are edited in **/admin/settings** and stored in the database.

---

## Architecture

```
src/
  app/                 Next.js App Router
    (site)/            public marketing pages
    (flow)/            login, register, start-project (focused layout)
    dashboard/         client portal
    admin/             admin console
    editor/            editor workspace
    api/               thin REST handlers
  components/          ui/ (design system), site/, portal/, admin/, review/, wizard/, shell/
  lib/                 shared pure logic: statuses, permissions, conditions, lead scoring, money, CMS resource definitions
  server/
    services/          all business logic + authorisation + audit (one file per domain)
    auth/              sessions, actor, TOTP, crypto (scrypt)
    api/               route wrappers: auth, CSRF, validation, rate limiting, error envelope
    events/            event bus, automations, actions
    jobs/              Postgres-backed queue, runner, sweeps
    storage/ payments/ email/ security/
prisma/                schema + migrations
scripts/               seed, demo data, worker, admin bootstrap, test suites
```

**Layering.** Pages (server components) and API routes both call **services**; a service checks the actor's permission, scopes every query to what that actor may see, writes the audit log, and emits events. API routes are thin: `authRoute` / `publicRoute` add CSRF verification, zod validation, rate limits and a uniform `{ ok, data } | { ok: false, error }` envelope. Client components call the API through one helper and a `useAction` hook (loading, errors, field errors, refresh).

**Ownership, not obscurity.** Every project/quote/invoice/file lookup goes through a scope function (`projectScope(actor)` etc.). Something that exists but isn't yours returns **404**, not 403, so IDs can't be probed. Client organisation roles (owner, manager, assistant, billing, member) are enforced in the service layer.

**Money** is stored as integer minor units plus a currency code. Totals, tax, deposit and balance are computed server-side from line items; the client never submits a total.

**Storage.** Media never lives in Postgres. Uploads go browser → storage using short-lived signed URLs (local provider signs with `AUTH_SECRET`; S3 uses presigned PUT/GET). The database holds keys and metadata. Downloads are authorised per request and then redirected to a signed URL.

**Background work.** Emails, automation actions, reminders, overdue sweeps and exports run through the `jobs` table (`FOR UPDATE SKIP LOCKED`, retries with back-off). Run them inline (default), with `npm run worker`, or from an external scheduler hitting `POST /api/cron/run` with `Authorization: Bearer $CRON_SECRET`.

**Content is data.** Site copy, pricing, FAQs, services, testimonials, blog, case studies, the intake form and email templates are database rows edited in the admin console; a small in-process cache is invalidated on every write.

---

## The project workflow

`INQUIRY → AWAITING_QUOTE → AWAITING_CONTRACT → AWAITING_PAYMENT → ONBOARDING → AWAITING_ASSETS → QUEUED → EDITING → INTERNAL_REVIEW → CLIENT_REVIEW → REVISION ⇄ CLIENT_REVIEW → FINAL_REVIEW → APPROVED → DELIVERED → ARCHIVED` (plus `CANCELLED`).

* Legal transitions are a table (`src/lib/statuses.ts`); anything else is rejected with a 409.
* **Gates** are computed from real records: work can't start before the agreement is signed and the required payment is received; final files can't be released before approval and (by default) full payment.
* An admin can **override** the machine, with a mandatory reason; the override is written to the audit log.
* Most transitions happen as a side effect of real events (quote accepted, contract signed, deposit paid, version released, client approves) — see the automation rules in `/admin/automations`, which admins can edit.
* Clients see a simplified 7-step view; internal statuses and notes never reach them.

---

## Roles and permissions

Ten built-in roles (`super_admin`, `admin`, `project_manager`, `senior_editor`, `editor`, `motion_designer`, `reviewer`, `finance`, `support`, `client`) map to fine-grained permissions such as `invoices:write`, `projects:read_assigned`, `files:delete`. Roles and their permissions are editable in **/admin/team**; every check happens server-side in the service layer (the UI only hides what you can't do).

Editors see only projects they're assigned to and never see quotes, invoices or payment details unless a role grants it.

---

## Security notes

* **Passwords** hashed with scrypt; **sessions** are random tokens stored hashed in the database, `HttpOnly`, `SameSite=Lax`, `Secure` in production, individually revocable from Settings → Security. Optional **TOTP 2FA** with recovery codes; magic-link and Google sign-in.
* **CSRF**: mutating API calls require a signed double-submit token *and* a same-origin check. **Rate limits** on login, registration, password reset, public forms and uploads.
* The built-in rate limiter is **in-memory per process**. Behind several instances, put a shared limiter (Redis) at `hit()` in `src/server/security/ratelimit.ts` or limit at your proxy/CDN. `DISABLE_RATE_LIMIT` is a local testing switch and is ignored in production.
* **Uploads**: type and size validation, filename sanitising, optional malware scan hook, no public bucket, signed short-lived URLs, RFC 5987 download names.
* **User-supplied HTML and Markdown** (blog, case studies, help articles) is sanitised; React escapes everything else. CSP, frame denial, `nosniff`, referrer policy and HSTS are set in `next.config.ts`.
* **Audit log** for logins, permission changes, status changes and overrides, money events, exports, settings and CMS edits.
* Lead scores, internal notes, margins and audit data are never serialised to client-role responses.
* Set `DEMO_MODE=false` and remove demo data (`npm run db:clear-demo`) before going live.

---

## Deployment

### Docker (app + worker + Postgres)

```bash
cp .env.example .env     # set AUTH_SECRET, CRON_SECRET, APP_URL, DEMO_MODE=false, STORAGE_*, EMAIL_*, PAYMENT_*
docker compose --profile app up -d --build
docker compose exec app npm run admin:create -- you@yourstudio.com "Your Name"
```

The `app` container applies migrations and the idempotent bootstrap on each start; `worker` runs background jobs (`JOBS_INLINE=false` for the app). Put a TLS-terminating reverse proxy (Caddy, Nginx, Traefik, a cloud load balancer) in front and set `APP_URL` to the public `https://` origin. `GET /api/health` is the health check.

### Node host / PaaS

`npm ci && npm run build`, then `npm run db:deploy && npm run db:seed && npm start`. The build needs **no database**. Use S3-compatible storage (local disk isn't shared between instances) and either a worker process or a scheduler calling `/api/cron/run` every minute.

### Object storage (S3 / R2 / MinIO)

```
STORAGE_PROVIDER=s3
STORAGE_BUCKET=your-bucket
STORAGE_REGION=auto                      # e.g. us-east-1 for AWS
STORAGE_ENDPOINT=https://<account>.r2.cloudflarestorage.com   # empty for AWS
STORAGE_ACCESS_KEY=…  STORAGE_SECRET_KEY=…
```

The bucket must stay **private**. Add a CORS rule allowing `PUT`/`GET`/`HEAD` from your `APP_URL` with the `Content-Type` and `Content-Length` headers. The app's CSP is derived from these variables automatically.

### Stripe

```
PAYMENT_PROVIDER=stripe
PAYMENT_SECRET_KEY=sk_live_…
PAYMENT_WEBHOOK_SECRET=whsec_…
```

Create a webhook endpoint at `https://your-domain/api/webhooks/payments` for `checkout.session.completed`. Payments are only marked paid from the verified webhook, never from the browser redirect.

### Email

Set `EMAIL_PROVIDER` to `resend`, `postmark` or `sendgrid` with `EMAIL_API_KEY` and a verified `EMAIL_FROM`. Every message — sent or failed — appears in **/admin/emails** with its status and any provider error; failed jobs can be retried from **/admin/settings → Integrations & system**. Templates are editable in the admin console.

### Going-live checklist

- [ ] `AUTH_SECRET`, `CRON_SECRET` are long random values; `DEMO_MODE=false`
- [ ] `npm run db:clear-demo` (if demo data was loaded) and create your admin
- [ ] Business details, currency, tax, brand colour set in **/admin/settings**
- [ ] Storage bucket private with CORS; a test upload and download succeed
- [ ] Email provider verified; trigger a real email (for example a portal invite) and confirm it in **/admin/emails**
- [ ] Stripe webhook configured; a small live payment verified end to end
- [ ] Background jobs running (worker or cron) — check the sweep in **/admin/settings → Integrations & system**
- [ ] Automated database backups **and** a restore rehearsal (below)
- [ ] TLS in front of the app; consider shared rate limiting if you run >1 instance

---

## Backups and restore

Two things hold state: **PostgreSQL** and **object storage** (or `.storage/` for the local provider).

```bash
# database (daily, keep 14+ days, copy off-host)
pg_dump --format=custom --file=faizaneditspro-$(date +%F).dump "$DATABASE_URL"

# restore into an empty database
pg_restore --clean --if-exists --no-owner --dbname="$DATABASE_URL" faizaneditspro-2026-01-01.dump
```

Enable versioning or replication on the bucket (or back up `.storage/`). Restore the database and storage from the same point in time. Test a restore before you need one.

---

## Testing

```bash
# terminal 1 — DISABLE_RATE_LIMIT lets the suites hammer login endpoints (dev only)
DISABLE_RATE_LIMIT=true npm run dev
# terminal 2
npm run db:seed:demo           # UI suite expects demo data
npm run test:e2e               # API/business workflow + security (158 checks)
npm run test:ui                # browser flows
node scripts/qa-layout.mjs     # responsive/structure sweep (add --dark for dark mode)
node scripts/qa-axe.mjs        # WCAG 2.1 AA audit with axe-core (add --dark for dark mode)
TZ_ID=Asia/Karachi node scripts/qa-timezone.mjs   # server/browser time-zone hydration check
```

`test:e2e` walks the full 32-step lifecycle (inquiry → quote → contract → payment → onboarding → files → editing → revision → approval → delivery → testimonial) and then attacks it: cross-client access (IDOR) on projects, quotes, invoices, contracts, files, video streams, comments and messages; RBAC; CSRF; illegal status transitions; payment gating. Records it creates are flagged as demo data so `db:clear-demo` removes them.

The UI suites use the Chromium that ships with Playwright (`PLAYWRIGHT_BROWSERS_PATH`); set `CHROME=/path/to/chromium` to override.

---

## Verification status and known limits

Verified in this repository (all re-run after the final code change):

* type-check and production `next build` — with and without a database; production server start, sign-in and role redirects
* the 158-check business-workflow and security suite (`test:e2e`) and the 27 browser flows (`test:ui`)
* layout sweep across 75+ pages at 375 / 820 / 1440 px in light and dark mode (`qa-layout`): no horizontal overflow, labelled controls, one `<h1>` per page, no console errors
* axe-core WCAG 2.1 A/AA audit of the public, client, admin and editor pages in light and dark mode (`qa-axe`): zero violations
* hydration under other time zones — Asia/Karachi and America/Los_Angeles (`qa-timezone`)
* an emptied database: every public and admin page renders cleanly (`qa-empty`), and `db:clear-demo` leaves no demo records, history or document numbering behind
* admin / editor / client authorisation boundaries, including cross-client access attempts (IDOR)

Keyboard-only use and screen-reader announcements were reviewed structurally (labels, landmarks, roles, focus rings) but not with real assistive technology.

Not verified end to end, and worth a smoke test in your own environment:

* **Docker image** — the `Dockerfile` / `docker-compose.yml` are written and the compose file validates, but no container runtime was available to build it.
* **Stripe live mode, real S3/R2 buckets, Resend/Postmark/SendGrid, Google OAuth, Turnstile, ClamAV** — implemented behind provider interfaces; only the demo/console/local providers were exercised against a running app.
* **MP4 playback in automated tests** — the headless Chromium used for testing has no H.264 decoder, so the review player was exercised with WebM. Real browsers play MP4 normally.

Design decisions and limits:

* Project statuses are an enum plus a transition table rather than a database table (so illegal states are unrepresentable and the type checker sees them).
* The contract "PDF" is a print-optimised HTML page (use *Download / print → Save as PDF*); no server-side PDF renderer is bundled.
* Uploads are single-request signed PUTs; multipart upload for files above 5 GB is not implemented.
* Google Cloud Storage is supported through its S3-interoperability endpoint.
* The default rate limiter and in-process cache are per instance (see Security notes).
* Dates and times are formatted in **UTC** (times of day are labelled "UTC") so server-rendered and browser-rendered text always agree. Greetings use the visitor's own clock (via a `fe_tz` cookie); booking slots are shown in the visitor's zone. Per-user time-zone display for every timestamp is not implemented.
* `workspaceId` is present on every table for multi-tenancy, but the app currently serves a single workspace and does not include tenant provisioning or per-tenant domains.
