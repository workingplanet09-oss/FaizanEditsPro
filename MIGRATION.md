# Moving from the previous version (Node.js / PostgreSQL) to this PHP / MySQL version

This page is **only for people who already run the previous version and want to keep their data**. A new site does not need it — follow `README.md` instead.

The old and the new application use the **same data model** (same tables, same columns, same ids), so the data can be copied over row for row. Nothing is transformed except the type differences listed in [`MIGRATION_MAP.md`](MIGRATION_MAP.md) (PostgreSQL `jsonb`/arrays → MySQL `JSON`, booleans → `TINYINT(1)`, timestamps → `DATETIME(3)` in UTC).

## Strategy

| Step | What happens | Risk |
| --- | --- | --- |
| 1. Freeze | Put the old site in maintenance (or just stop using it) so nothing changes during the copy. | none |
| 2. Structure | Import the **structure only** into an empty MySQL database (not `database.sql`, which also contains fresh reference data). | none |
| 3. Data | Export every table of the old PostgreSQL database as MySQL `INSERT` statements and import them. | low — verified in step 5 |
| 4. Files | Copy the uploaded files so every `storageKey` in the database points at a real file. | low |
| 5. Verify | A comparison tool reads **every value of every row** on both sides and reports any difference. | — |
| 6. Switch | Point your domain at the new site. Keep the old database as a backup for a few weeks. | rollback = point the domain back |

## What you need on your own computer

* Node.js 18+ and PHP 8.2+ (only for this one-off copy — **not** on the hosting account)
* Network access to the old PostgreSQL database and to the new MySQL database (for cPanel, enable *Remote MySQL* for your IP, or run the import in phpMyAdmin)

## Step by step

```bash
# 0. inside a copy of this repository:  npm install pg        (the exporter uses the PostgreSQL driver)
export DATABASE_URL="postgresql://USER:PASSWORD@OLD-HOST:5432/OLD-DATABASE"     # the OLD database (read only — nothing is ever written to it)

# 1. structure (tables, keys, indexes, foreign keys)  →  import into an EMPTY MySQL database
node migration-tools/pg-to-mysql.mjs schema > schema.sql

# 2. all rows
#    sessions and queued jobs are short-lived and are not worth copying
node migration-tools/pg-to-mysql.mjs data --skip=jobs,sessions,rate_limits > data.sql

# 3. import both, in this order, with phpMyAdmin (Import tab) or:
mysql -u USER -p NEW-DATABASE < schema.sql
mysql -u USER -p NEW-DATABASE < data.sql

# 4. compare every value (exit code 0 = identical) — SKIP must list the same tables that were left out of the export
SKIP=jobs,sessions,rate_limits php migration-tools/verify-migration.php \
    "pgsql:host=OLD-HOST;dbname=OLD-DATABASE" PGUSER PGPASS \
    "mysql:host=NEW-HOST;dbname=NEW-DATABASE;charset=utf8mb4" MYUSER MYPASS
```

### Files (uploads)

The database stores only a *storage key* for each file (for example `ws/abc123/projects/xyz/7f3a…`). The new site keeps files in `storage/uploads/` using the very same keys:

* **Old site stored files on disk** (`STORAGE_PROVIDER=local`): copy the contents of the old `.storage/` folder into `storage/uploads/` on the new site, keeping the folder structure.
  `rsync -a old-server:/path/to/.storage/ ./storage/uploads/`
* **Old site used S3 / R2:** download the bucket into `storage/uploads/` with the same key names, for example
  `aws s3 sync s3://YOUR-BUCKET ./storage/uploads/` (add `--endpoint-url …` for R2 or other S3-compatible services).

Then make sure the folder is writable by PHP (`chmod -R 750 storage` on cPanel's default setup is fine).

### `config.php`

* Set `'secret'` to the **same value as the old `AUTH_SECRET`**. Two-factor secrets are encrypted with it in the same format, so every user's authenticator keeps working.
* Set `'app_url'` to the new address and `'mode'` to `'live'`.

## Things that behave differently after the move

| Item | What users will notice | Why |
| --- | --- | --- |
| **Passwords** | Everyone sets a new password **once**: *Forgot your password?* on the sign-in page. The sign-in form tells them so. | The old version hashed passwords with *scrypt*, which plain PHP cannot verify. The new version uses bcrypt. Nothing is lost — only the hash format differs. Email sign-in links and Google sign-in (if configured) work immediately. |
| **Sessions** | Everyone is signed out once. | Session cookies are not portable between the two systems. |
| **Two-factor authentication** | Keeps working when `secret` equals the old `AUTH_SECRET`; otherwise users set it up again. | See above. |
| **Signed links** (download links, sign-in links already emailed) | Links issued before the move stop working. | They are signed with a key that changes with the platform. New links work immediately. |
| **Background jobs** | The queue starts empty. | Pending emails of the old system are not copied. |

## If something does not match

`verify-migration.php` prints the table, the row id and the column of every difference. Typical causes: rows written to the old database *after* the export (export again), or a table that was skipped with `--skip`.

## Rolling back

The old database is never modified. To go back, point the domain at the old site again.
