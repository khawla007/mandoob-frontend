#!/usr/bin/env bash
set -Eeuo pipefail

readonly ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly POSTGRES_IMAGE="public.ecr.aws/supabase/postgres:17.11.0.006"
readonly CONTAINER_NAME="mandoob-sql-integration-${GITHUB_RUN_ID:-local}-$$"
readonly LOCAL_PASSWORD="mandoob-sql-integration-only"
readonly PRODUCTION_RECOVERY_MIGRATION="20260915090000_0087_reconcile_existing_pro_access.sql"
readonly BOOTSTRAP_FILE="scripts/sql-integration/bootstrap.sql"
readonly CONCURRENCY_SETUP_FILE="scripts/sql-integration/inbound-destination-concurrency-setup.sql"
readonly CONCURRENCY_CALL_FILE="scripts/sql-integration/inbound-destination-concurrency-call.sql"
readonly CONCURRENCY_VERIFY_FILE="scripts/sql-integration/inbound-destination-concurrency-verify.sql"
readonly -a FIXTURES=(
  "event_queue_foundation.sql"
  "p3_10_operational_runtime.sql"
  "inbound_webhook_atomic_lifecycle.sql"
)

container_started=0

cleanup() {
  local status=$?
  trap - EXIT
  if [[ "$container_started" -eq 1 ]]; then
    if [[ "${SQL_INTEGRATION_KEEP_CONTAINER:-0}" == '1' ]]; then
      echo "SQL_INTEGRATION_CONTAINER=$CONTAINER_NAME"
      exit "$status"
    fi
    if [[ "$status" -ne 0 ]]; then
      docker logs --tail 100 "$CONTAINER_NAME" 2>&1 || true
    fi
    docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
  fi
  exit "$status"
}
trap cleanup EXIT

fail() {
  echo "SQL_INTEGRATION_ERROR: $*" >&2
  exit 1
}

require_transactional_fixture() {
  local fixture=$1
  grep -Eiq '^[[:space:]]*\\set[[:space:]]+ON_ERROR_STOP[[:space:]]+on' "$fixture" \
    || fail "$fixture does not enable ON_ERROR_STOP"
  grep -Eiq '^[[:space:]]*begin;[[:space:]]*$' "$fixture" \
    || fail "$fixture does not begin a transaction"
  grep -Eiq '^[[:space:]]*rollback;[[:space:]]*$' "$fixture" \
    || fail "$fixture does not roll back"
}

cd "$ROOT_DIR"
command -v docker >/dev/null 2>&1 || fail 'Docker is required'
docker info >/dev/null 2>&1 || fail 'Docker daemon is unavailable'
[[ -f "$BOOTSTRAP_FILE" ]] || fail "$BOOTSTRAP_FILE is missing"
[[ -f "$CONCURRENCY_SETUP_FILE" ]] || fail "$CONCURRENCY_SETUP_FILE is missing"
[[ -f "$CONCURRENCY_CALL_FILE" ]] || fail "$CONCURRENCY_CALL_FILE is missing"
[[ -f "$CONCURRENCY_VERIFY_FILE" ]] || fail "$CONCURRENCY_VERIFY_FILE is missing"
[[ -d supabase/migrations ]] || fail 'supabase/migrations is missing'

for fixture in "${FIXTURES[@]}"; do
  fixture_path="supabase/tests/$fixture"
  [[ -f "$fixture_path" ]] || fail "$fixture_path is missing"
  require_transactional_fixture "$fixture_path"
done

echo "Starting disposable PostgreSQL 17.11 container: $CONTAINER_NAME"
docker run --detach --name "$CONTAINER_NAME" \
  --env "POSTGRES_PASSWORD=$LOCAL_PASSWORD" \
  --health-cmd='pg_isready -U supabase_admin -d postgres' \
  --health-interval=1s --health-timeout=5s --health-retries=90 \
  "$POSTGRES_IMAGE" >/dev/null
container_started=1

for _ in {1..180}; do
  health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}missing{{end}}' "$CONTAINER_NAME")"
  [[ "$health" == 'unhealthy' ]] && fail 'disposable PostgreSQL became unhealthy'
  if [[ "$health" == 'healthy' ]] \
    && docker logs "$CONTAINER_NAME" 2>&1 | grep -q 'PostgreSQL init process complete' \
    && docker exec "$CONTAINER_NAME" pg_isready -U supabase_admin -d postgres >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
[[ "${health:-missing}" == 'healthy' ]] \
  || fail 'timed out waiting for disposable PostgreSQL initialization'

docker exec "$CONTAINER_NAME" mkdir -p /tmp/mandoob-migrations /tmp/mandoob-tests /tmp/mandoob-bootstrap
docker cp scripts/sql-integration/. "$CONTAINER_NAME:/tmp/mandoob-bootstrap"
docker cp supabase/migrations/. "$CONTAINER_NAME:/tmp/mandoob-migrations"
docker cp supabase/tests/. "$CONTAINER_NAME:/tmp/mandoob-tests"

docker exec "$CONTAINER_NAME" \
  psql -X --set ON_ERROR_STOP=1 -U supabase_admin -d postgres \
  -f /tmp/mandoob-bootstrap/bootstrap.sql

docker exec \
  --env "PRODUCTION_RECOVERY_MIGRATION=$PRODUCTION_RECOVERY_MIGRATION" \
  "$CONTAINER_NAME" sh -eu -c '
    applied=0
    skipped=0
    for migration in /tmp/mandoob-migrations/*.sql; do
      name="$(basename "$migration")"
      if [ "$name" = "$PRODUCTION_RECOVERY_MIGRATION" ]; then
        echo "SKIP $name — reduced-scope launch blocker: production-data recovery assumptions"
        skipped=$((skipped + 1))
        continue
      fi
      echo "APPLY $name"
      psql -X --set ON_ERROR_STOP=1 -U supabase_admin -d postgres -f "$migration" >/tmp/migration.log 2>&1 \
        || { cat /tmp/migration.log >&2; exit 1; }
      applied=$((applied + 1))
    done
    [ "$skipped" -eq 1 ] || { echo "Expected exactly one launch-blocking migration skip" >&2; exit 1; }
    echo "MIGRATIONS_APPLIED=$applied MIGRATIONS_SKIPPED=$skipped"
  '

for fixture in "${FIXTURES[@]}"; do
  echo "FIXTURE $fixture"
  docker exec "$CONTAINER_NAME" \
    psql -X --set ON_ERROR_STOP=1 -U supabase_admin -d postgres \
    -f "/tmp/mandoob-tests/$fixture"
done

echo 'PROBE inbound destination concurrent replay'
docker exec "$CONTAINER_NAME" \
  psql -X --set ON_ERROR_STOP=1 -U supabase_admin -d postgres \
  -f "/tmp/mandoob-bootstrap/$(basename "$CONCURRENCY_SETUP_FILE")"
docker exec "$CONTAINER_NAME" sh -eu -c '
  psql -X --set ON_ERROR_STOP=1 -At -F "|" -U supabase_admin -d postgres \
    -f /tmp/mandoob-bootstrap/inbound-destination-concurrency-call.sql > /tmp/concurrency-a.out &
  pid_a=$!
  psql -X --set ON_ERROR_STOP=1 -At -F "|" -U supabase_admin -d postgres \
    -f /tmp/mandoob-bootstrap/inbound-destination-concurrency-call.sql > /tmp/concurrency-b.out &
  pid_b=$!
  wait "$pid_a"
  wait "$pid_b"
  result_a="$(cat /tmp/concurrency-a.out)"
  result_b="$(cat /tmp/concurrency-b.out)"
  id_a="${result_a%%|*}"
  id_b="${result_b%%|*}"
  [ -n "$id_a" ] && [ "$id_a" = "$id_b" ] \
    || { echo "Concurrent provisioning returned unstable destinations" >&2; exit 1; }
  case "$result_a:$result_b" in
    "$id_a|f|f:$id_a|f|t"|"$id_a|f|t:$id_a|f|f") ;;
    *) echo "Concurrent provisioning did not produce one mutation and one replay" >&2; exit 1 ;;
  esac
'
docker exec "$CONTAINER_NAME" \
  psql -X --set ON_ERROR_STOP=1 -U supabase_admin -d postgres \
  -f "/tmp/mandoob-bootstrap/$(basename "$CONCURRENCY_VERIFY_FILE")"

echo "SQL_INTEGRATION_OK fixtures=${#FIXTURES[@]} concurrency_probes=1"
