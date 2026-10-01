#!/usr/bin/env bash
# Builds throw-away databases, starts four local servers and runs the attack suites against them.
#   bash php-tests/run-attacks.sh            (needs MariaDB/MySQL with a user that may create fep_* databases, and Chromium for the XSS run)
set -uo pipefail
cd "$(dirname "$0")/.."
U=${MYSQL_USER:-faizan}; P=${MYSQL_PASS:-faizan_dev}
M() { mysql -u"$U" -p"$P" "$@"; }
for d in fep_attack fep_attack_setup; do M -e "drop database if exists $d; create database $d character set utf8mb4 collate utf8mb4_unicode_ci"; done
M fep_attack < public_html/database.sql && M fep_attack < public_html/database-demo.sql
M fep_attack_setup < public_html/database.sql
pids=()
start() { # name port db extra-env...
  local port=$1 db=$2; shift 2
  env FEP_STRICT=1 FEP_NO_PSEUDO_CRON=1 FEP_TEST_DB=$db FEP_TEST_URL=http://127.0.0.1:$port "$@" php -S 127.0.0.1:$port -t public_html php-tests/dev-router.php >/tmp/fep-attack-$port.log 2>&1 &
  pids+=($!)
}
trap 'kill "${pids[@]}" 2>/dev/null' EXIT
start 8092 fep_attack FEP_DISABLE_RATE_LIMIT=1                                                       # demo mode, debug, no rate limits
start 8093 fep_attack FEP_TEST_MODE=live FEP_TEST_DEBUG=0 FEP_TEST_NO_APP_URL=1 FEP_TEST_HOPS=1      # live mode, debug off, real rate limits, no app_url
start 8094 fep_attack_setup FEP_TEST_MODE=live FEP_TEST_DEBUG=0 FEP_TEST_NO_APP_URL=1                # fresh install for the first-run wizard
start 8097 fep_attack FEP_TEST_MODE=live FEP_TEST_DEBUG=0 FEP_TEST_STRIPE=whsec_test_0123456789abcdef                                # live mode with Stripe configured
start 8098 fep_attack FEP_TEST_MODE=live FEP_TEST_DEBUG=0 FEP_TEST_TURNSTILE=1                                                    # spam challenge configured
start 8095 fep_does_not_exist FEP_TEST_MODE=live FEP_TEST_DEBUG=0                                    # database unreachable
for port in 8092 8093 8094 8095 8097 8098; do curl -s -o /dev/null --retry 30 --retry-connrefused --retry-delay 1 http://127.0.0.1:$port/api/health; done
export FEP_TEST_DB=fep_attack FEP_TEST_URL=http://127.0.0.1:8092 BASE=http://127.0.0.1:8092
rc=0
php php-tests/attacks.php || rc=1
php php-tests/payments.php || rc=1
node php-tests/browser/xss.mjs || rc=1
exit $rc
