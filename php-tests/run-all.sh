#!/usr/bin/env bash
# Runs every automated suite against throw-away databases and local servers, then prints one summary.
#   bash php-tests/run-all.sh [--skip-attacks]
# Needs: PHP 8.2+ (pdo_mysql, curl), a MySQL/MariaDB user that may create fep_* databases, Node + Chromium for the browser suites.
set -uo pipefail
cd "$(dirname "$0")/.."
U=${MYSQL_USER:-faizan}; P=${MYSQL_PASS:-faizan_dev}
M() { mysql -u"$U" -p"$P" "$@"; }
OUT=${OUT:-/tmp/fep-run-all}; mkdir -p "$OUT"; rm -f "$OUT"/*.log
mk() { M -e "drop database if exists $1; create database $1 character set utf8mb4 collate utf8mb4_unicode_ci" && M "$1" < public_html/database.sql && { [ "${2:-}" = demo ] && M "$1" < public_html/database-demo.sql || true; }; }
mk fep_regress demo; mk fep_fresh; mk fep_cycle
pids=()
srv() { local port=$1 db=$2; shift 2; env FEP_STRICT=1 FEP_NO_PSEUDO_CRON=1 FEP_DISABLE_RATE_LIMIT=1 FEP_TEST_DB=$db FEP_TEST_URL=http://127.0.0.1:$port "$@" php -S 127.0.0.1:$port -t public_html php-tests/dev-router.php >"$OUT/server-$port.log" 2>&1 & pids+=($!); }
trap 'kill "${pids[@]}" 2>/dev/null' EXIT
srv 8081 fep_regress; srv 8082 fep_fresh FEP_TEST_MODE=live; srv 8083 fep_cycle
for port in 8081 8082 8083; do curl -s -o /dev/null --retry 30 --retry-connrefused --retry-delay 1 http://127.0.0.1:$port/api/health; done
declare -A RESULT
run() { # name, env..., command...
  local name=$1; shift
  if env "$@" >"$OUT/$name.log" 2>&1; then RESULT[$name]="PASS"; else RESULT[$name]="FAIL"; fi
  printf '%-22s %s   %s\n' "$name" "${RESULT[$name]}" "$(sed 's/\x1b\[[0-9;]*m//g' "$OUT/$name.log" | grep -E '[0-9]+ passed' | tail -1)"
}
E1="FEP_TEST_DB=fep_regress FEP_TEST_URL=http://127.0.0.1:8081 BASE=http://127.0.0.1:8081"
run e2e-workflow      $E1 php php-tests/e2e-workflow.php
run security-audit    $E1 php php-tests/security-audit.php
for t in public wizard portal-client review admin admin-studio editor; do run "browser-$t" $E1 node php-tests/browser/$t.mjs; done
run browser-setup     FEP_TEST_DB=fep_fresh FEP_TEST_URL=http://127.0.0.1:8082 BASE=http://127.0.0.1:8082 SAMPLE=1 node php-tests/browser/setup.mjs
run demo-cycle        FEP_TEST_DB=fep_cycle FEP_TEST_URL=http://127.0.0.1:8083 php php-tests/demo-cycle.php
if [ "${1:-}" != "--skip-attacks" ]; then
  kill "${pids[@]}" 2>/dev/null; pids=()
  run attacks bash php-tests/run-attacks.sh
fi
fails=0; for k in "${!RESULT[@]}"; do [ "${RESULT[$k]}" = PASS ] || fails=$((fails+1)); done
echo; echo "$fails suite(s) failed.  Logs: $OUT"
exit $((fails>0))
