#!/usr/bin/env bash
# CONN-HR-1 disposable replay orchestrator.
#
# DISPOSABLE ONLY. Refuses hosted / linked projects, forbidden local ports, and
# any server whose cluster_name is not storeagent-conn-hr-1-disposable.
# Never writes under the repository's protected .vitest/ tree.
#
# Usage (from a clean HEAD export OR the working tree, with CONN_HR1_ROOT set):
#   CONN_HR1_ROOT=/path/to/export \
#   CONN_HR1_PGHOST=127.0.0.1 CONN_HR1_PGPORT=55437 \
#   CONN_HR1_PGUSER=postgres CONN_HR1_EVIDENCE=/path/to/evidence \
#   bash scripts/conn-hr-1/disposable/replay.sh <command>
#
# Commands:
#   verify-env          Refuse bad hosts/ports; print server identity
#   sha-check           Verify the five CONN files against migrations.sha256
#   apply-52            Apply first 52 migrations via supabase db push --db-url
#   apply-conn-cli      Attempt five CONN migrations via CLI (expected #5 fail)
#   apply-conn-psql     Apply five CONN migrations via single-txn candidate
#   readonly-pre        Run readonly 01–09 against current DB
#   readonly-post       Run readonly 10 post-apply catalog
#   prescan-parity      Run disposable prescan parity suite
#   vitest-hash         Hash protected .vitest (must be unchanged)

set -euo pipefail

CLUSTER_NAME_EXPECTED='storeagent-conn-hr-1-disposable'
FORBIDDEN_PORTS='5432 54322 55322'
CONN_VERSIONS=(
  20261121120000
  20261122120000
  20261122130000
  20261122140000
  20261124120000
)

die() { echo "CONN-HR-1 REFUSED: $*" >&2; exit 2; }

require_env() {
  local k
  for k in CONN_HR1_ROOT CONN_HR1_PGHOST CONN_HR1_PGPORT CONN_HR1_PGUSER; do
    [[ -n "${!k:-}" ]] || die "$k is required"
  done
  [[ -d "$CONN_HR1_ROOT/supabase/migrations" ]] || die "CONN_HR1_ROOT missing migrations"
  [[ "$CONN_HR1_PGHOST" == "127.0.0.1" || "$CONN_HR1_PGHOST" == "::1" || "$CONN_HR1_PGHOST" == "localhost" ]] \
    || die "host must be loopback (got $CONN_HR1_PGHOST)"
  for p in $FORBIDDEN_PORTS; do
    if [[ "$CONN_HR1_PGPORT" == "$p" ]]; then
      die "forbidden port $p"
    fi
  done
  # Never fall back to a linked Supabase project.
  unset SUPABASE_ACCESS_TOKEN SUPABASE_DB_PASSWORD SUPABASE_PROJECT_ID || true
  export PGPASSWORD="${CONN_HR1_PGPASSWORD:-}"
}

psql_q() {
  psql -h "$CONN_HR1_PGHOST" -p "$CONN_HR1_PGPORT" -U "$CONN_HR1_PGUSER" \
    -d "${CONN_HR1_PGDATABASE:?CONN_HR1_PGDATABASE required}" \
    -v ON_ERROR_STOP=1 "$@"
}

db_url() {
  # Prefer trust/peer-free URL for local disposable clusters.
  local pw_q=""
  if [[ -n "${CONN_HR1_PGPASSWORD:-}" ]]; then
    pw_q=":${CONN_HR1_PGPASSWORD}"
  fi
  printf 'postgresql://%s%s@%s:%s/%s' \
    "$CONN_HR1_PGUSER" "$pw_q" "$CONN_HR1_PGHOST" "$CONN_HR1_PGPORT" \
    "${CONN_HR1_PGDATABASE}"
}

cmd_verify_env() {
  require_env
  local cn host addr
  cn=$(psql_q -Atc "select current_setting('cluster_name')")
  [[ "$cn" == "$CLUSTER_NAME_EXPECTED" ]] || die "cluster_name=$cn (expected $CLUSTER_NAME_EXPECTED)"
  addr=$(psql_q -Atc "select coalesce(host(inet_server_addr()),'127.0.0.1')")
  [[ "$addr" == "127.0.0.1" || "$addr" == "::1" ]] || die "server addr $addr not loopback"
  echo "OK cluster=$cn host=$CONN_HR1_PGHOST port=$CONN_HR1_PGPORT db=$CONN_HR1_PGDATABASE user=$CONN_HR1_PGUSER addr=$addr"
  psql_q -Atc "select version()"
}

cmd_sha_check() {
  require_env
  local manifest="$CONN_HR1_ROOT/supabase/migrations.sha256"
  local migdir="$CONN_HR1_ROOT/supabase/migrations"
  local line file hash got
  while read -r line; do
    [[ -z "$line" ]] && continue
    hash=${line%%  *}
    file=${line#*  }
    case "$file" in
      20261121120000_*|20261122120000_*|20261122130000_*|20261122140000_*|20261124120000_*)
        got=$(shasum -a 256 "$migdir/$file" | awk '{print $1}')
        [[ "$got" == "$hash" ]] || die "SHA mismatch $file"
        echo "OK $file"
        ;;
    esac
  done < "$manifest"
}

mig_paths() {
  local migdir="$CONN_HR1_ROOT/supabase/migrations" v
  for v in "${CONN_VERSIONS[@]}"; do
    ls "$migdir/${v}_"*.sql
  done
}

cmd_apply_52() {
  require_env
  cmd_verify_env
  local url
  url=$(db_url)
  # Use a disposable CLI home so nothing touches a linked project.
  export HOME="${CONN_HR1_CLI_HOME:-${CONN_HR1_EVIDENCE:-/tmp}/cli-home}"
  mkdir -p "$HOME"
  (
    cd "$CONN_HR1_ROOT"
    # Only the first 52 files must be present as pending; CONN files may exist
    # on disk but must not yet be in history. Use --include-all only when the
    # remote history is empty / behind in a continuous prefix.
    yes | DO_NOT_TRACK=1 SUPABASE_INTERNAL_NO_TELEMETRY=1 \
      supabase db push --db-url "$url" --yes
  )
}

cmd_apply_conn_cli() {
  require_env
  cmd_verify_env
  local url
  url=$(db_url)
  export HOME="${CONN_HR1_CLI_HOME:-${CONN_HR1_EVIDENCE:-/tmp}/cli-home}"
  mkdir -p "$HOME"
  (
    cd "$CONN_HR1_ROOT"
    yes | DO_NOT_TRACK=1 SUPABASE_INTERNAL_NO_TELEMETRY=1 \
      supabase db push --db-url "$url" --yes
  ) || true
  echo "NOTE: CLI apply of #5 is expected to fail with SQLSTATE 25P01 (LOCK outside txn)."
}

cmd_apply_conn_psql() {
  require_env
  cmd_verify_env
  cmd_sha_check
  local paths
  paths=($(mig_paths))
  [[ ${#paths[@]} -eq 5 ]] || die "expected 5 migration paths"
  # Candidate lives in the working tree (may be newer than a HEAD export).
  local candidate="${CONN_HR1_CANDIDATE:-$CONN_HR1_ROOT/tests/sql/conn-hr-1-disposable-single-transaction-candidate.psql}"
  [[ -f "$candidate" ]] || candidate="$(cd "$(dirname "$0")/../../.." && pwd)/tests/sql/conn-hr-1-disposable-single-transaction-candidate.psql"
  [[ -f "$candidate" ]] || die "candidate psql missing: $candidate"
  psql_q \
    -v "mig1=${paths[0]}" \
    -v "mig2=${paths[1]}" \
    -v "mig3=${paths[2]}" \
    -v "mig4=${paths[3]}" \
    -v "mig5=${paths[4]}" \
    -f "$candidate"
}

run_readonly_files() {
  local f
  for f in "$@"; do
    echo "##### $(basename "$f")"
    # Single session: open a read-only txn, run the SELECT-only file, roll back.
    psql_q \
      -c "start transaction read only;" \
      -f "$f" \
      -c "rollback;"
  done
}

cmd_readonly_pre() {
  require_env
  cmd_verify_env
  local dir
  dir="$(cd "$(dirname "$0")/../readonly" && pwd)"
  run_readonly_files \
    "$dir"/01_platform.sql \
    "$dir"/02_migration_history.sql \
    "$dir"/03_prerequisites.sql \
    "$dir"/04_ownership_acl.sql \
    "$dir"/05_roles_rls_definer.sql \
    "$dir"/06_publications_triggers.sql \
    "$dir"/07_json_guard_prescan.sql \
    "$dir"/08_logging_indicators.sql \
    "$dir"/09_workload_locks.sql
}

cmd_readonly_post() {
  require_env
  cmd_verify_env
  local f
  f="$(cd "$(dirname "$0")/../readonly" && pwd)/10_post_apply_catalog.sql"
  run_readonly_files "$f"
}

cmd_prescan_parity() {
  require_env
  cmd_verify_env
  local f
  f="$(cd "$(dirname "$0")" && pwd)/prescan-parity.sql"
  psql_q -f "$f"
}

cmd_vitest_hash() {
  local repo="${CONN_HR1_REPO:-}"
  [[ -n "$repo" ]] || repo="$(cd "$(dirname "$0")/../../.." && pwd)"
  local target="$repo/.vitest/json/output.json"
  [[ -f "$target" ]] || die "protected .vitest file missing at $target"
  shasum -a 1 "$target"
  echo "expected 55661591291aea593f7b3bfc623d547e09dccbfb"
}

main() {
  local cmd="${1:-}"
  shift || true
  case "$cmd" in
    verify-env) cmd_verify_env "$@" ;;
    sha-check) cmd_sha_check "$@" ;;
    apply-52) cmd_apply_52 "$@" ;;
    apply-conn-cli) cmd_apply_conn_cli "$@" ;;
    apply-conn-psql) cmd_apply_conn_psql "$@" ;;
    readonly-pre) cmd_readonly_pre "$@" ;;
    readonly-post) cmd_readonly_post "$@" ;;
    prescan-parity) cmd_prescan_parity "$@" ;;
    vitest-hash) cmd_vitest_hash "$@" ;;
    *)
      echo "usage: $0 {verify-env|sha-check|apply-52|apply-conn-cli|apply-conn-psql|readonly-pre|readonly-post|prescan-parity|vitest-hash}" >&2
      exit 1
      ;;
  esac
}

main "$@"
