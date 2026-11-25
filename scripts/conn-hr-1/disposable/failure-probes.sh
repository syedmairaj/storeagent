#!/usr/bin/env bash
# CONN-HR-1 disposable failure / lock / interrupt probes.
# DISPOSABLE ONLY. Requires the same env as replay.sh.
#
# Proves:
#   F1 SET LOCAL lock_timeout active inside BEGIN
#   F2 LOCK TABLE outside txn => SQLSTATE 25P01 (re-check + cite CLI evidence)
#   F3 lock_timeout aborts a blocked LOCK within ~5s
#   F4 mid-txn failure rolls back prior DDL (no leftover schema)
#   F5 history fingerprint unchanged after F4
#   F6 client disconnect mid-txn leaves no partial CONN apply (psql candidate)
#   F7 candidate refuses non-disposable cluster_name

set -euo pipefail

CLUSTER_NAME_EXPECTED='storeagent-conn-hr-1-disposable'
FORBIDDEN_PORTS='5432 54322 55322'

die() { echo "CONN-HR-1 REFUSED: $*" >&2; exit 2; }
pass() { echo "PASS $*"; }
fail() { echo "FAIL $*" >&2; exit 1; }

require_env() {
  local k
  for k in CONN_HR1_PGHOST CONN_HR1_PGPORT CONN_HR1_PGUSER CONN_HR1_PGDATABASE; do
    [[ -n "${!k:-}" ]] || die "$k is required"
  done
  [[ "$CONN_HR1_PGHOST" == "127.0.0.1" || "$CONN_HR1_PGHOST" == "::1" || "$CONN_HR1_PGHOST" == "localhost" ]] \
    || die "host must be loopback"
  for p in $FORBIDDEN_PORTS; do
    if [[ "$CONN_HR1_PGPORT" == "$p" ]]; then
      die "forbidden port $p"
    fi
  done
}

psql_q() {
  psql -q -h "$CONN_HR1_PGHOST" -p "$CONN_HR1_PGPORT" -U "$CONN_HR1_PGUSER" \
    -d "$CONN_HR1_PGDATABASE" -v ON_ERROR_STOP=1 "$@"
}

require_env
cn=$(psql_q -Atc "select current_setting('cluster_name')")
[[ "$cn" == "$CLUSTER_NAME_EXPECTED" ]] || die "cluster_name=$cn"

snap=$(psql_q -Atc "
select count(*) || '|' || md5(string_agg(version, ',' order by version))
  || '|' || (to_regclass('public.integration_credentials') is not null)
  || '|' || (select count(*) from pg_trigger where tgname='zz_conn_1d_e_secret_json_guard')
from supabase_migrations.schema_migrations;
")
echo "SNAP $snap"

# F1
v=$(psql_q -Atc "begin; set local lock_timeout='5s'; select current_setting('lock_timeout'); rollback;")
[[ "$v" == "5s" ]] || fail "F1 SET LOCAL got $v"
pass "F1 SET LOCAL lock_timeout active inside BEGIN"

# F2 — drive LOCK in autocommit via a separate one-shot connection with
# protocol that cannot wrap BEGIN. Use ON_ERROR_STOP and expect failure.
set +e
out=$(psql -h "$CONN_HR1_PGHOST" -p "$CONN_HR1_PGPORT" -U "$CONN_HR1_PGUSER" \
  -d "$CONN_HR1_PGDATABASE" -v ON_ERROR_STOP=1 \
  -c "lock table public.integrations in share row exclusive mode;" 2>&1)
rc=$?
set -e
echo "$out" | rg -q '25P01|transaction blocks' || fail "F2 unexpected output: $out"
[[ $rc -ne 0 ]] || fail "F2 expected non-zero exit"
pass "F2 LOCK outside txn => 25P01"

# F3 — holder session blocks LOCK; waiter with lock_timeout=2s must abort.
HOLD_SQL=$(mktemp)
WAIT_SQL=$(mktemp)
HOLD_LOG=$(mktemp)
WAIT_LOG=$(mktemp)
cleanup() { rm -f "$HOLD_SQL" "$WAIT_SQL" "$HOLD_LOG" "$WAIT_LOG"; }
trap cleanup EXIT

cat >"$HOLD_SQL" <<'SQL'
begin;
lock table public.integrations in access exclusive mode;
select pg_sleep(20);
rollback;
SQL

cat >"$WAIT_SQL" <<'SQL'
begin;
set local lock_timeout = '2s';
lock table public.integrations in share row exclusive mode;
rollback;
SQL

psql -h "$CONN_HR1_PGHOST" -p "$CONN_HR1_PGPORT" -U "$CONN_HR1_PGUSER" \
  -d "$CONN_HR1_PGDATABASE" -v ON_ERROR_STOP=1 -f "$HOLD_SQL" >"$HOLD_LOG" 2>&1 &
HOLD_PID=$!
sleep 1
set +e
psql -h "$CONN_HR1_PGHOST" -p "$CONN_HR1_PGPORT" -U "$CONN_HR1_PGUSER" \
  -d "$CONN_HR1_PGDATABASE" -v ON_ERROR_STOP=1 -f "$WAIT_SQL" >"$WAIT_LOG" 2>&1
WAIT_RC=$?
set -e
kill "$HOLD_PID" 2>/dev/null || true
wait "$HOLD_PID" 2>/dev/null || true
rg -q 'canceling statement due to lock timeout|55P03' "$WAIT_LOG" || fail "F3 no lock timeout: $(cat "$WAIT_LOG")"
[[ $WAIT_RC -ne 0 ]] || fail "F3 expected waiter failure"
pass "F3 lock_timeout aborts blocked LOCK"

# F4/F5 — mid-txn DDL then exception; schema must not remain; snap unchanged.
set +e
psql_q <<'SQL' >/dev/null 2>&1
begin;
create schema conn_hr_1_fp_tmp;
create table conn_hr_1_fp_tmp.t(id int);
do $$ begin raise exception 'CONN_HR_1_F4_ROLLBACK' using errcode = 'P0001'; end $$;
commit;
SQL
set -e
exists=$(psql_q -Atc "select to_regnamespace('conn_hr_1_fp_tmp') is not null")
[[ "$exists" == "f" ]] || fail "F4 leftover schema conn_hr_1_fp_tmp"
pass "F4 mid-txn failure rolls back DDL"

snap2=$(psql_q -Atc "
select count(*) || '|' || md5(string_agg(version, ',' order by version))
  || '|' || (to_regclass('public.integration_credentials') is not null)
  || '|' || (select count(*) from pg_trigger where tgname='zz_conn_1d_e_secret_json_guard')
from supabase_migrations.schema_migrations;
")
[[ "$snap2" == "$snap" ]] || fail "F5 snap changed: $snap -> $snap2"
pass "F5 history/CONN fingerprint unchanged after F4"

# F6 — interrupt candidate mid-flight on a fresh empty-target DB is orchestrated
# by the operator (see runbook). Here we only prove that an open txn killed by
# client disconnect rolls back a marker table.
set +e
psql_q <<'SQL' >/dev/null 2>&1 &
begin;
create table public.conn_hr_1_disconnect_marker(id int);
select pg_sleep(60);
commit;
SQL
SLEEP_PID=$!
sleep 1
kill -9 "$SLEEP_PID" 2>/dev/null || true
wait "$SLEEP_PID" 2>/dev/null || true
sleep 1
set -e
marker=$(psql_q -Atc "select to_regclass('public.conn_hr_1_disconnect_marker') is not null")
[[ "$marker" == "f" ]] || fail "F6 marker table survived client kill"
pass "F6 client disconnect rolls back open txn"

# F7 — candidate refuses wrong cluster (simulate by checking the gate query).
gate=$(psql_q -Atc "
select current_setting('cluster_name') = 'storeagent-conn-hr-1-disposable'
  and coalesce(host(inet_server_addr()), '127.0.0.1') in ('127.0.0.1', '::1');
")
[[ "$gate" == "t" ]] || fail "F7 disposable gate unexpectedly false"
pass "F7 disposable gate true on this cluster (refusal path covered by candidate \\if)"

echo "CONN-HR-1 failure probes: ALL PASS"
echo "FINAL_SNAP $snap2"
