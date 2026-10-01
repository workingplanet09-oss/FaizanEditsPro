#!/usr/bin/env bash
# Regenerates public_html/database.sql and public_html/database-demo.sql from the previous (PostgreSQL/Prisma) application.
# HISTORICAL DEVELOPER TOOL — needs the old Node project (git commit 00c185d checked out next to this folder), PostgreSQL and a MySQL/MariaDB server.
# The hosting account never runs this, and it no longer works from this tree (the Node source has been removed; see DEVELOPMENT.md).
#
#   PG_ADMIN_URL=postgresql://user:pass@127.0.0.1:5432/postgres  MYSQL_USER=user MYSQL_PASS=pass  bash migration-tools/build-sql.sh
#
# Steps: fresh PostgreSQL database → migrations → bootstrap seed → export (database.sql) → demo seed → export → compare (database-demo.sql)
set -euo pipefail
cd "$(dirname "$0")/.."
PG_ADMIN_URL=${PG_ADMIN_URL:-postgresql://faizan:faizan_dev@127.0.0.1:5432/postgres}
MYSQL_USER=${MYSQL_USER:-faizan}; MYSQL_PASS=${MYSQL_PASS:-faizan_dev}
WORK=$(mktemp -d); export STORAGE_LOCAL_DIR="$WORK/storage" DEMO_MODE=true
DB=fep_build_$$
psql "$PG_ADMIN_URL" -qc "create database $DB"
export DATABASE_URL="${PG_ADMIN_URL%/*}/$DB"
trap 'psql "$PG_ADMIN_URL" -qc "drop database if exists $DB" || true; rm -rf "$WORK"' EXIT

npx prisma migrate deploy >/dev/null
npx tsx scripts/seed.ts >/dev/null
node migration-tools/pg-to-mysql.mjs schema > "$WORK/schema.sql"
node migration-tools/pg-to-mysql.mjs data --skip=jobs,sessions,rate_limits > "$WORK/boot-data.sql"
npx tsx scripts/seed-demo.ts >/dev/null
node migration-tools/pg-to-mysql.mjs data --skip=jobs,sessions,rate_limits > "$WORK/demo-data.sql"

# the structure (+ the two tables the PHP version adds) and the reference data, in one file
{
  echo "-- FaizanEdits Pro — database structure + the reference data the application needs (roles, permissions, forms, templates, services…)."
  echo "-- Import this file into an EMPTY MySQL/MariaDB database with phpMyAdmin (Import tab). Then open your website: it asks you to create the first admin."
  echo "-- MySQL 5.7+ / MariaDB 10.3+ with utf8mb4."
  echo
  cat "$WORK/schema.sql"; echo; sed '1d' "$WORK/boot-data.sql"
} > public_html/database.sql

# compare in MySQL: BOOT = structure + bootstrap rows, DEMO = BOOT + demo rows
for d in fep_boot fep_demo; do mysql -u"$MYSQL_USER" -p"$MYSQL_PASS" -e "drop database if exists $d; create database $d character set utf8mb4 collate utf8mb4_unicode_ci"; done
mysql -u"$MYSQL_USER" -p"$MYSQL_PASS" fep_boot < "$WORK/schema.sql"; mysql -u"$MYSQL_USER" -p"$MYSQL_PASS" fep_boot < "$WORK/boot-data.sql"
mysql -u"$MYSQL_USER" -p"$MYSQL_PASS" fep_demo < "$WORK/schema.sql"; mysql -u"$MYSQL_USER" -p"$MYSQL_PASS" fep_demo < "$WORK/demo-data.sql"
DEMO_STORAGE="$STORAGE_LOCAL_DIR" php migration-tools/build-sql.php fep_boot fep_demo "$MYSQL_USER" "$MYSQL_PASS"
mysql -u"$MYSQL_USER" -p"$MYSQL_PASS" -e "drop database fep_boot; drop database fep_demo"
echo "done: public_html/database.sql  public_html/database-demo.sql"
