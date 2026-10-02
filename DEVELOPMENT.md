# Development notes

For people who change the code. **None of this is needed to install or run the site** — see `README.md` for that.

## Layout

```
public_html/            ← the whole website; this is what gets uploaded
  index.php             front controller (every request that is not a real file)
  config.php            the ONE settings file
  cron.php              optional scheduled run
  database.sql          structure + reference data          database-demo.sql   optional sample studio
  app/core/             router, request/response, PDO layer, sessions, CSRF, validation, crypto, rendering
  app/lib/ services/ api/ pages/   loaded alphabetically by app/bootstrap.php (drop a file in → it is live)
  app/views/            PHP templates (site, portal, admin, editor, auth, layouts, partials)
  assets/               compiled CSS, vanilla JS, fonts, images, bundled demo media
  storage/              uploads (closed to the web by .htaccess)
migration-tools/        developer scripts (never uploaded)
php-tests/              test suites (never uploaded)
```

Conventions: routes are declared with `api()`, `api_public()`, `page()`, `page_post()`, `staff_get()`; every API response is `{ok, data}` / `{ok:false, error}`; every state-changing route is protected by CSRF and a permission check; the client only ever receives data scoped to the signed-in person.

## Run it locally

Needs PHP 8.2+ with `pdo_mysql`, and a MySQL/MariaDB server.

```bash
# database (empty) + structure + sample data
mysql -e "create database faizan_php character set utf8mb4 collate utf8mb4_unicode_ci"
mysql faizan_php < public_html/database.sql
mysql faizan_php < public_html/database-demo.sql        # optional

# start the built-in server with the test settings (php-tests/test-config.php) — it mimics .htaccess
FEP_STRICT=1 FEP_DISABLE_RATE_LIMIT=1 FEP_NO_PSEUDO_CRON=1 \
  php -S 127.0.0.1:8081 -t public_html php-tests/dev-router.php
```

`FEP_STRICT=1` turns every PHP warning/notice/deprecation into a visible failure. `FEP_DISABLE_RATE_LIMIT=1` and `FEP_NO_PSEUDO_CRON=1` make tests deterministic. None of these variables exist on the hosting account.

## Tests

Everything below needs only PHP, a MySQL/MariaDB user that may create `fep_*` databases, and (for the browser suites) Node + Chromium. Nothing is deployed to the hosting account.

```bash
bash php-tests/run-all.sh            # (add --full for the slow layout + axe sweeps) builds throw-away databases + local servers, runs every suite, prints one summary (logs in /tmp/fep-run-all)
bash php-tests/run-attacks.sh        # only the hostile-input suites (starts 6 servers: demo, live, fresh install, database down, Stripe, Turnstile)
```

| Suite | What it covers |
| --- | --- |
| `php-tests/e2e-workflow.php` | The 32-step project workflow over HTTP, then attacks: cross-client access, RBAC, CSRF, illegal status changes, payment gating. |
| `php-tests/security-audit.php` | Reads the route table and attacks **every** API route: signed-out access, CSRF (4 variants), second workspace, client/editor role exposure, id probes with foreign ids, ~80 cross-client mutations (database verified unchanged), page access, upload pipeline, request size. |
| `php-tests/attacks.php` | SQL injection (login, search, ids, writes), sessions (fixation, logout, expiry, suspension, password change/reset, token abuse, 2FA), mass assignment and tampering, verbs/CORS/headers/cookies, e-mail links vs forged `Host`, live-mode error pages, upload-token abuse, downloads/deletes by the wrong person, stored-script payloads at HTML level, rate limits, Turnstile wiring. |
| `php-tests/payments.php` | Webhook signature/freshness/tamper/replay, amounts and currencies, the demo checkout outside demo mode, "no provider configured". |
| `php-tests/email-smtp.php` | The SMTP driver against `php-tests/smtp-sink.py`: auth, MIME, UTF-8, header/recipient smuggling, the queue → worker → SMTP path. |
| `php-tests/demo-cycle.php` | Load sample data → use it → remove it → database is clean again → load again. |
| `php-tests/browser/<name>.mjs` | Real-browser flows (Chromium via `playwright-core`): `public`, `wizard`, `portal-client`, `review`, `admin`, `admin-studio`, `editor`, `setup`, `xss` (payloads in every user-controlled field, nothing may execute and the CSP may not have to block anything). |
| `php-tests/qa/*.mjs` | `links` (every notification link opens in the recipient's own area), `seo` (robots, sitemap, titles, descriptions, canonical, Open Graph, alt text, JSON-LD, no loopback URLs with `PUBLIC_ORIGIN`), `layout` (8 viewports from 320 px to 1920 px, light and `--dark`: overflow, labels, headings, landmarks), `axe` (WCAG 2.1 A/AA), `keyboard` (skip link, focus rings, dialog focus), `timezone` (Karachi / Los Angeles / Kiritimati / Pago Pago), `empty` (every page on an empty database), `brand` (the personal-brand specification measured on the rendered pages: palette, fonts, type scale, spacing, buttons, wordmark, contrast, motion, wording — see `BRANDING.md`)., `glitch` (every screen the demo accounts reach, desktop and phone, light and dark: console/script errors, failed requests, layout shift while loading, sideways scrolling, broken images, content stuck invisible, endless animations, `transition: all`, controls that resize on hover, header height, theme-switch fades, anchor offsets, the phone menu), `preview` (the static copy in `preview/` resolves every link and loads from a sub-path). |
| `php migration-tools/verify-migration.php …` | Value-by-value comparison of an old PostgreSQL database and the new MySQL one. |

## Static preview (all pages as plain HTML)

`migration-tools/make-preview.mjs` crawls a running copy of the site in demo mode (public pages, then the client portal, admin console and editor workspace as the demo accounts see them) and writes a folder of static `.html` files plus the assets. Actions that need PHP are switched off in that copy and say so. It is for showing the design, not for running the business.

```bash
BASE=http://127.0.0.1:8081 OUT=preview node migration-tools/make-preview.mjs
```

## Styles and icons

The stylesheet is compiled with Tailwind **at development time** and committed (`public_html/assets/css/app.css`, `assets/js/icons.js`). Rebuild after changing any template or class name:

```bash
npm install            # dev tools only (tailwind, postcss, playwright-core, pg)
node migration-tools/build-css.mjs
```

## Where `database.sql` / `database-demo.sql` came from

They were generated once from the previous PostgreSQL/Prisma application (git commit `00c185d`, which still contains the Next.js source) with `migration-tools/build-sql.sh`. That script needs that old project checked out, PostgreSQL and MySQL — it cannot run from this tree any more, and nothing on the hosting account uses it. From now on edit `database.sql` directly when the schema changes, and ship a small `upgrade-YYYY-MM-DD.sql` with the release notes.

`migration-tools/pg-to-mysql.mjs` (structure and rows of an *existing* old installation → MySQL) and `verify-migration.php` are still current: see `MIGRATION.md`.
