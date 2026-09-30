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

| Command | What it covers |
| --- | --- |
| `php php-tests/e2e-workflow.php` | The 32-step project workflow over HTTP, then attacks: cross-client access, RBAC, CSRF, illegal status changes, payment gating. |
| `php php-tests/demo-cycle.php` | Load sample data → use it → remove it → database is clean again → load again. |
| `node php-tests/browser/<name>.mjs` | Real-browser flows (Chromium via `playwright-core`): `public`, `wizard`, `portal-client`, `review`, `admin`, `admin-studio`, `editor`, `setup`. |
| `node php-tests/smoke-pages.mjs admin /admin /admin/projects …` | Signs in and fetches pages, flags non-200 answers and any PHP error text. |
| `php migration-tools/verify-migration.php …` | Value-by-value comparison of an old PostgreSQL database and the new MySQL one. |

## Styles and icons

The stylesheet is compiled with Tailwind **at development time** and committed (`public_html/assets/css/app.css`, `assets/js/icons.js`). Rebuild after changing any template or class name:

```bash
npm install            # dev tools only (tailwind, postcss, playwright-core, pg)
node migration-tools/build-css.mjs
```

## Regenerating `database.sql` / `database-demo.sql`

They were generated from the previous PostgreSQL/Prisma schema (git commit `00c185d`) with `migration-tools/build-sql.sh`, which needs that old project, PostgreSQL and MySQL. If you change the schema from now on, edit the tables in `database.sql` directly and ship a small `upgrade-YYYY-MM-DD.sql` with the release notes.
