# Parity checklist — previous version (Next.js / Prisma / PostgreSQL) → PHP / MySQL

**How to read this.** *Old* = the feature in the previous version. *PHP* = where it lives now. *Verified by* names the automated run that exercised it on this machine (PHP 8.4 + MariaDB 10.11 behind PHP's built-in web server, Chromium for the browser runs). **PASS** is written only where such a run really exercised the feature and passed. Anything that could not be exercised here says **NOT VERIFIED** or **CHANGED**, with the reason. Nothing in this file was tested on a real cPanel account.

Run counts are from the last full run (`bash php-tests/run-all.sh`, **0 suites failed**, on PHP 8.4.19 and again on PHP 8.3.6); the slow sweeps (`qa:layout` light + dark, `qa:axe` light + dark) were run on the final code one by one and are clean. Numbers in brackets are checks per suite.

| Short name | What it is |
| --- | --- |
| **e2e** | `php-tests/e2e-workflow.php` — the 32-step project workflow over HTTP + attacks [164] |
| **audit** | `php-tests/security-audit.php` — every API route attacked from signed-out / client / editor / second workspace [4,353] |
| **attacks** | `php-tests/attacks.php` — SQL injection, sessions, tampering, headers, e-mail links, error leakage, uploads, rate limits [174] |
| **pay** | `php-tests/payments.php` — webhook + demo-checkout safety [37] |
| **smtp** | `php-tests/email-smtp.php` — mail driver against a local SMTP sink [14] |
| **xss** | `php-tests/browser/xss.mjs` — hostile text in every field, opened in a real browser [58] |
| **b:public / wizard / portal / review / admin / studio / editor / setup** | real-browser runs of the public site [45], Start-a-Project wizard [37], client portal [42], review player [26], admin console [36 + 73], editor workspace [27], first-run wizard [16] |
| **demo-cycle** | load sample data → use → remove → clean → reload [23] |
| **qa:links / seo / layout / axe / keyboard / timezone / empty** | `php-tests/qa/*` — see [DEVELOPMENT.md](DEVELOPMENT.md) |
| **verify-migration** | `migration-tools/verify-migration.php` — old PostgreSQL vs new MySQL, value by value |

---

## 1. Public website

| Feature | Old | PHP | Verified by | Result |
| --- | --- | --- | --- | --- |
| Home | `/` | `/` | b:public, qa:seo, qa:layout, qa:axe | PASS |
| Services list + service detail | `/services`, `/services/[slug]` | same | b:public, qa:seo (all sitemap URLs) | PASS |
| Work / portfolio grid, category filter, video dialog | `/work` | same (vanilla JS) | b:public (filter, dialog, lazy video source, Esc) | PASS |
| Case studies list + detail | `/case-studies` | same | b:public, qa:seo | PASS |
| Process, Pricing, About, FAQ (accordion), Help, Privacy, Terms | pages | same | b:public, qa:seo, qa:layout | PASS |
| Blog list + post | `/blog` | same | b:public, qa:seo | PASS |
| Contact form → submission → admin Submissions | `/contact` | same | b:public, b:studio, attacks (flood/honeypot/timing) | PASS |
| Newsletter sign-up | footer | same | attacks (rate limit) | PASS |
| Booking: choose type → day → slot → confirm | `/book` | same | b:public, qa:timezone (see §11) | PASS |
| Start-a-Project wizard: conditional questions, validation, reference-file upload, review, resume after reload | `/start-project` | same | b:wizard, e2e step 3 | PASS |
| Light / dark theme, remembered | toggle | toggle + `theme.js` | b:public, qa:layout `--dark`, qa:axe `--dark` | PASS |
| SEO: unique titles, descriptions, canonical, Open Graph / Twitter, JSON-LD, alt text, sitemap, robots, manifest, icons | metadata API | `lib/seo.php`, `pages/meta.php` | qa:seo [516 checks] + again with a production-style address [448] (no loopback URLs) | PASS |
| Branded 404 / 500 / 503 / 429 pages | error pages | `core/view.php` | b:public (404), attacks (500, 503) | PASS (429 page not opened) |
| Mobile menu, skip link, focus rings | yes | yes | qa:keyboard [19] | PASS |

## 2. Accounts and sign-in

| Feature | Old | PHP | Verified by | Result |
| --- | --- | --- | --- | --- |
| E-mail + password sign-in | scrypt | **bcrypt** (SHA-256 pre-hash) | e2e, b:portal, attacks | PASS |
| Existing users from the old database | scrypt hashes | cannot be checked by PHP → "Forgot your password?" once (message tells them) | legacy copy test: hint shown, reset works, new hash is bcrypt, projects visible | **CHANGED** (documented in MIGRATION.md) |
| Registration + e-mail verification | yes | yes | e2e, attacks | PASS |
| Magic-link sign-in | yes | yes | e2e, attacks (single-use, wrong type, expiry) | PASS |
| Forgot / reset password | yes | yes | attacks (single-use, expiry, no enumeration, sessions revoked) | PASS |
| Two-factor (TOTP) with QR + manual key | yes | yes (AES-256-GCM secret, Node-compatible when `secret` = old `AUTH_SECRET`) | b:portal (QR), attacks (enable, half-signed-in session gets nothing, wrong code refused, secret encrypted) | PASS (recovery-code use not exercised) |
| "Sign in with Google" | yes | yes | attacks (unconfigured → clean redirect) | **NOT VERIFIED** with Google (needs credentials) |
| Session list / revoke other devices | yes | yes | attacks | PASS |
| Demo logins (admin / editor / client) | yes | demo mode only | attacks, qa:* | PASS |
| First-run setup wizard (no seed script on cPanel) | CLI `admin:create` | `/setup` | b:setup [16], attacks (remembers address, refuses second run) | PASS (new) |

## 3. Client portal (`/dashboard`)

| Feature | Verified by | Result |
| --- | --- | --- |
| Dashboard "needs your attention" | b:portal | PASS |
| Projects list + detail tabs (overview, files, videos, messages, changes, billing, delivery) | b:portal | PASS |
| Quote: read, accept, decline with reason, no second accept | b:portal, e2e | PASS |
| Contract: read, typed or drawn signature, terms tick, signed record with hash | b:portal, e2e | PASS |
| Invoice: view, pay (demo checkout), project moves on | b:portal, e2e | PASS |
| Online card payment (Stripe) | pay (webhook side) | **PARTIAL** — signed webhook, replay, amounts, currency verified; creating a real Stripe Checkout session needs the network and a key: NOT VERIFIED |
| Project setup brief after payment | b:portal | PASS |
| Files: chunked upload, versions, signed download with real name | b:portal, e2e, audit | PASS |
| Messages thread | b:portal | PASS |
| Change requests, file requests | b:portal, e2e | PASS |
| Brand kit (colours, fonts, notes) | b:portal | PASS |
| Settings: profile, password (mismatch / wrong current), notifications, 2FA, sessions | b:portal, attacks | PASS |
| Retainers | qa:links, qa:timezone (page renders) | PASS (renders; no dedicated flow test) |
| Review player: signed video URL, keyboard (Space, ←/→, C), speed, timeline markers, timestamped notes + replies, resolve (staff only), request changes, approve with confirmation | b:review [26], e2e | PASS |
| Delivery: final files locked until paid, published only when ready, testimonial request | e2e, b:review, b:portal | PASS |
| Notification bell + preferences | b:portal, qa:links | PASS |
| Mobile bottom navigation | b:portal | PASS |

## 4. Admin console (`/admin`)

| Feature | Verified by | Result |
| --- | --- | --- |
| Command center, alerts, pipeline, deadlines | b:admin | PASS |
| Projects: list, search, board, new, workspace (12 tabs), edit, duplicate, assign team | b:admin | PASS |
| Status control: only legal steps offered, payment/approval gate with reason, admin override recorded | b:admin, e2e, audit | PASS |
| Tasks, notes (pin), time entries + live timer, staff replies | b:admin | PASS |
| Quote builder (lines, discount, tax, deposit/balance preview, draft → send, edit) | b:studio | PASS |
| Invoice builder, send, offline payment (partial), payments list | b:studio | PASS |
| Contracts, e-signature records | e2e, b:portal | PASS |
| Leads & CRM: status, temperature override, activity, convert → client + project | b:studio, e2e | PASS |
| Contact submissions → lead | b:studio | PASS |
| Clients (new, edit, status, 5 tabs) | b:studio | PASS |
| Calendar: month / week / day, schedule a call | b:studio, qa:timezone | PASS |
| Website CMS: services, pricing, portfolio, case studies, testimonials, blog, categories, KB, project types, templates, e-mail templates, FAQs | b:studio (all types list; FAQ create) | PASS (create/edit/delete exercised for FAQs only; other types open the editor) |
| Project form builder (add / delete question, conditions) | b:studio | PASS |
| Automations (create, toggle, delete) | b:studio | PASS |
| Team: invite, roles | b:studio, audit | PASS |
| Settings (business, workflow, booking, SEO, notifications) with unsaved-change guard | b:studio | PASS |
| Integrations board (what is configured, never the secrets) | b:studio | PASS |
| Analytics (charts or honest empty state) | b:studio, qa:empty | PASS |
| Exports (CSV) | b:studio, audit (editor refused) | PASS |
| Audit log, e-mail outbox | b:studio, e2e | PASS |
| Revisions board, Files library, Messages inbox, Retainers | b:admin / qa:layout / qa:axe (render) | PASS (render + permission checks) |
| Demo data: load / remove (Super Admin only) | demo-cycle [23] | PASS (new) |
| Mobile (375 px) | b:studio | PASS |

## 5. Editor workspace (`/editor`)

| Feature | Verified by | Result |
| --- | --- | --- |
| "My work" home, project list, only assigned projects | b:editor, audit | PASS |
| Brief, files, video tabs; no billing; cannot reassign team | b:editor | PASS |
| Upload a new version from a link; review player | b:editor | PASS |
| Tasks, timer, account | b:editor | PASS |
| Cannot see unassigned projects, invoices, clients, admin | audit, b:editor | PASS |

## 6. The 32-step workflow and its guards

| Feature | Verified by | Result |
| --- | --- | --- |
| Visitor → lead → client → quote → contract → payment → onboarding → assets → editor → V1 → feedback → revision → V2 → approval → delivery → testimonial | e2e (steps 1–32) | PASS |
| Illegal transitions refused server-side (409), override audited | e2e, audit | PASS |
| Payment gates (423 before payment; final files locked until balance paid) | e2e | PASS |
| Recipient-aware notifications, e-mails queued per step | e2e, qa:links [136 links across 9 users, each opens in the recipient's own area] | PASS |

## 7. Files and uploads

| Feature | Verified by | Result |
| --- | --- | --- |
| Chunked uploads (4 MB pieces, declared size enforced), version numbering (`_V3` → v3) | e2e, b:wizard | PASS |
| Dangerous types refused (`.exe .php .phtml .sh .bat .dll .jar …`, double extensions) | e2e, audit, attacks | PASS |
| Disguised files rejected after upload (EXE as `.mp4`, HTML as `.png`, PHP as `.mp4`) and removed | e2e, audit | PASS |
| Stored under opaque names; SVG / HTML / `.htaccess` served as download with `nosniff` + sandbox CSP | audit | PASS |
| Upload / download links: signed, expiring, bound to one file, one purpose | e2e, attacks | PASS |
| Replaying an upload link cannot overwrite a finished file | attacks | PASS |
| Range requests (206) for video | e2e, b:review | PASS |
| **S3 / Cloudflare R2 object storage** | old: optional | **CHANGED** — not ported. Files live in `storage/uploads` on the hosting account (the cPanel target). |
| Multi-GB uploads on real shared hosting | — | **NOT VERIFIED** (limits depend on the host; tested with files up to a few MB) |
| Optional malware-scan webhook | old: optional | PHP: present, **NOT VERIFIED** (no scanner to call) |

## 8. Notifications and e-mail

| Feature | Verified by | Result |
| --- | --- | --- |
| In-app notifications with authorised links | e2e, qa:links | PASS |
| E-mail queue with retry, templates, outbox | e2e, b:studio | PASS |
| No credentials → mail is logged, nothing breaks | e2e (default `log` driver) | PASS |
| SMTP driver (auth, UTF-8, MIME, header and recipient smuggling refused, queue → SMTP) | smtp [14] against a local sink | PASS locally — **NOT VERIFIED** against a real mail server / TLS |
| PHP `mail()` driver, Resend, Postmark, SendGrid | — | **NOT VERIFIED** |
| Links in e-mails never follow a forged `Host` header (config address, else the address remembered by the setup wizard) | attacks | PASS |
| Background jobs: run on page visits, optional `cron.php` | demo-cycle, cron.php run by hand (key, wrong key, CLI) | PASS locally — a real cPanel cron job **NOT VERIFIED** |

## 9. Payments

| Feature | Verified by | Result |
| --- | --- | --- |
| Amounts always come from the database, never from the request | attacks, pay | PASS |
| Demo checkout: labelled "simulation", **only in demo mode** | pay, b:portal | PASS |
| Live mode without a provider: "online payment isn't set up", never a fake success | pay | PASS |
| Webhook: signature, freshness (±10 min), tampering, replay, unpaid sessions, other event types, unknown invoice, wrong currency, amount above what is owed (refund review entry), failed async payment | pay [37] | PASS |
| Manual (offline) payments by staff only; over-payment, zero, negative, fractional, exponent amounts refused | attacks, b:studio | PASS |
| Stripe Checkout session creation, real webhooks from Stripe | — | **NOT VERIFIED** |

## 10. Security test list

| Test | Where | Result |
| --- | --- | --- |
| Unauthorized (signed-out) access to every protected route, API and page | audit §1, §6 | PASS |
| Client A → client B (read, write, download, delete, ids in every position) | audit §4–§6, e2e, b:portal | PASS |
| Editor → admin, editor → unassigned project | audit, b:studio, b:editor | PASS |
| Client → admin / editor areas | audit, b:portal | PASS |
| URL manipulation (foreign and made-up ids, path traversal, encoded dots) | audit, attacks | PASS |
| POST manipulation / mass assignment (role, status, workspace, amounts, scores) | attacks §C | PASS |
| CSRF — missing, wrong, cross-site, same-site-sibling token on every state-changing route; public forms across sites | audit §2 | PASS |
| SQL injection — login, 3,536 injected query strings on list/search routes, ids, writes, second-order | attacks §A | PASS |
| XSS — payloads stored in 14 kinds of field; HTML-level escaping and a real-browser run; CSP forbids inline script | attacks §I, xss [58] | PASS |
| Malicious uploads | audit §8, e2e, attacks | PASS |
| Unauthorized download / delete (other client, anonymous, unassigned editor, delivered files) | audit, attacks §H | PASS |
| Session fixation (planted id never adopted, re-login retires the old id) | attacks §B | PASS |
| Logout invalidation (row deleted, copied cookie useless, cookies cleared) | attacks §B | PASS |
| Session expiry, suspension takes effect at once, password change / reset signs out other devices | attacks §B | PASS |
| Brute force / flooding limits (login per account and per address, reset, magic link, token guessing, contact, newsletter, registration) | attacks §F | PASS |
| Open redirects | audit §7 | PASS |
| No SQL, paths, stack traces or secrets in live mode (pages, API, database down, failing query) | attacks §G | PASS |
| Secure cookie flags, HSTS behind HTTPS, no CORS grants, no caching of signed-in pages, `noindex` for portals | attacks §D | PASS |
| `.htaccess` rules, `app/`, `storage/`, `config.php`, `*.sql`, dotfiles unreachable | audit §8 against the dev router that mimics them | **NOT VERIFIED on a real Apache / LiteSpeed** |

## 11. Responsive, accessibility, time zones

| Feature | Verified by | Result |
| --- | --- | --- |
| Responsive at 320, 375, 390, 430, 768, 1024, 1440, 1920 px — public, client, admin, editor, ≈75 pages × 8 viewports, light and dark: no horizontal overflow, labelled controls, one `<h1>`, landmarks | qa:layout (light + `--dark`) | PASS |
| Accessibility — axe-core WCAG 2.1 A + AA, light and dark, desktop and 390 px | qa:axe | PASS |
| Keyboard: skip link, focus rings, dialog focus trap and return, Esc, menu, errors announced and linked (`aria-describedby`) | qa:keyboard [19] | PASS |
| Every page renders on an **empty** database | qa:empty | PASS |
| Time zones Asia/Karachi, America/Los_Angeles, Pacific/Kiritimati (+14), Pacific/Pago_Pago (−11), UTC: `<time>` converted in the browser, every other date identical everywhere; booking hours in the studio's zone, slots under the visitor's own day; scheduled calls stored as exact instants; calendar files events under the viewer's day; e-mail names the visitor's zone and UTC | qa:timezone [325] | PASS |
| Browsers other than Chromium (Safari, Firefox, old mobile browsers) | — | **NOT VERIFIED** |

## 12. Data and installation

| Feature | Verified by | Result |
| --- | --- | --- |
| `database.sql` imports into an empty database (85 tables, reference data) | setup, demo-cycle, run-all | PASS (MariaDB 10.11; MySQL 5.7 / 8 **NOT VERIFIED**) |
| `database-demo.sql` (optional sample studio) + one-click removal | demo-cycle | PASS |
| Old PostgreSQL → MySQL copy with the shipped tools, then value-by-value comparison | verify-migration: **2,806 rows in 85 tables identical** on the development data | PASS |
| Old uploaded files copied by key | MIGRATION.md | documented; **NOT VERIFIED** with an S3 bucket |
| Runs on PHP 8.4.19 and 8.3.6 | every suite run on both; every file lints under 8.3 | PASS (PHP **8.2 itself NOT VERIFIED**; a search found no 8.3+-only syntax or functions) |
| Runs on cPanel / Apache / LiteSpeed | — | **NOT VERIFIED** — see README "If something goes wrong" |
