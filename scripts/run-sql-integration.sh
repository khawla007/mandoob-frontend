#!/usr/bin/env bash
set -Eeuo pipefail

readonly ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly POSTGRES_IMAGE="public.ecr.aws/supabase/postgres:17.11.0.006"
readonly CONTAINER_NAME="mandoob-sql-integration-${GITHUB_RUN_ID:-local}-$$"
readonly LOCAL_PASSWORD="mandoob-sql-integration-only"
readonly PRODUCTION_RECOVERY_MIGRATION="20260915090000_0087_reconcile_existing_pro_access.sql"
readonly BOOTSTRAP_FILE="scripts/sql-integration/bootstrap.sql"
readonly RECOVERY_SETUP_FILE="scripts/sql-integration/pro-access-recovery-setup.sql"
readonly RECOVERY_VERIFY_FILE="scripts/sql-integration/pro-access-recovery-verify.sql"
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
[[ -f "$RECOVERY_SETUP_FILE" ]] || fail "$RECOVERY_SETUP_FILE is missing"
[[ -f "$RECOVERY_VERIFY_FILE" ]] || fail "$RECOVERY_VERIFY_FILE is missing"
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
        echo "SKIP $name — dedicated anonymized recovery verification follows"
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

recovery_content_digest() {
  local database=$1
  docker exec "$CONTAINER_NAME" \
    psql -X -At -U supabase_admin -d "$database" -c '
      select pg_catalog.encode(
        extensions.digest(
          pg_catalog.convert_to(
            coalesce(
              pg_catalog.string_agg(
                snapshot.payload,
                pg_catalog.chr(10)
                order by snapshot.table_name, snapshot.row_key
              ),
              $$<empty>$$
            ),
            $$UTF8$$
          ),
          $$sha256$$
        ),
        $$hex$$
      )
      from (
        select $$auth.users$$ as table_name, account.id::text as row_key,
          pg_catalog.to_jsonb(account)::text as payload
        from auth.users as account
        where account.id in (
          $$10000000-0000-4000-8000-000000000001$$::uuid,
          $$10000000-0000-4000-8000-000000000002$$::uuid,
          $$10000000-0000-4000-8000-000000000003$$::uuid
        )
        union all
        select $$public.profiles$$, profile.id::text, pg_catalog.to_jsonb(profile)::text
        from public.profiles as profile
        where profile.id in (
          $$10000000-0000-4000-8000-000000000001$$::uuid,
          $$10000000-0000-4000-8000-000000000002$$::uuid,
          $$10000000-0000-4000-8000-000000000003$$::uuid
        )
        union all
        select $$public.tenants$$, tenant.id::text, pg_catalog.to_jsonb(tenant)::text
        from public.tenants as tenant
        where tenant.id = $$20000000-0000-4000-8000-000000000001$$::uuid
        union all
        select $$public.company_profiles$$, company.id::text, pg_catalog.to_jsonb(company)::text
        from public.company_profiles as company
        where company.id = $$30000000-0000-4000-8000-000000000001$$::uuid
        union all
        select $$public.pro_profiles$$, pro.profile_id::text, pg_catalog.to_jsonb(pro)::text
        from public.pro_profiles as pro
        union all
        select $$public.pro_credentials$$, credential.id::text, pg_catalog.to_jsonb(credential)::text
        from public.pro_credentials as credential
        union all
        select $$public.pro_credential_decisions$$, decision.id::text, pg_catalog.to_jsonb(decision)::text
        from public.pro_credential_decisions as decision
        union all
        select $$public.pro_company_assignments$$, assignment.id::text, pg_catalog.to_jsonb(assignment)::text
        from public.pro_company_assignments as assignment
        union all
        select $$public.auth_events$$, event.id::text, pg_catalog.to_jsonb(event)::text
        from public.auth_events as event
        where event.actor_user_id = $$10000000-0000-4000-8000-000000000001$$::uuid
        union all
        select $$public.tenant_audit_log$$, audit.id::text, pg_catalog.to_jsonb(audit)::text
        from public.tenant_audit_log as audit
        where audit.tenant_id = $$20000000-0000-4000-8000-000000000001$$::uuid
        union all
        select $$public.pro_commercial_terms$$, term.id::text, pg_catalog.to_jsonb(term)::text
        from public.pro_commercial_terms as term
      ) as snapshot;
    '
}

expect_recovery_failure() {
  local database=$1
  local expected=$2
  if docker exec "$CONTAINER_NAME" sh -c \
    "psql -X --set ON_ERROR_STOP=1 -U supabase_admin -d '$database' -f '/tmp/mandoob-migrations/$PRODUCTION_RECOVERY_MIGRATION' >/tmp/pro-access-recovery-failure.log 2>&1"; then
    fail "migration 0087 unexpectedly succeeded in $database"
  fi
  docker exec "$CONTAINER_NAME" grep -F "$expected" /tmp/pro-access-recovery-failure.log >/dev/null \
    || { docker exec "$CONTAINER_NAME" cat /tmp/pro-access-recovery-failure.log >&2; fail "migration 0087 returned the wrong failure in $database"; }
}

echo 'PROBE migration 0087 anonymized preservation and recovery'
docker exec "$CONTAINER_NAME" \
  pg_dump -Fc --no-owner --no-acl --exclude-extension=pg_cron \
  -U supabase_admin -d postgres \
  -f /tmp/pro-access-recovery-baseline.dump
for database in pro_access_recovery_success pro_access_recovery_recovery; do
  docker exec "$CONTAINER_NAME" createdb \
    -U supabase_admin --maintenance-db=template1 --template=template0 "$database"
  docker exec "$CONTAINER_NAME" \
    pg_restore --no-owner --no-acl --exit-on-error \
    -U supabase_admin -d "$database" /tmp/pro-access-recovery-baseline.dump
  docker exec "$CONTAINER_NAME" \
    psql -X --set ON_ERROR_STOP=1 -U supabase_admin -d "$database" \
    -f "/tmp/mandoob-bootstrap/$(basename "$RECOVERY_SETUP_FILE")"
done

docker exec "$CONTAINER_NAME" \
  psql -X --set ON_ERROR_STOP=1 -U supabase_admin -d pro_access_recovery_success \
  -f "/tmp/mandoob-migrations/$PRODUCTION_RECOVERY_MIGRATION"
docker exec "$CONTAINER_NAME" \
  psql -X --set ON_ERROR_STOP=1 -U supabase_admin -d pro_access_recovery_success \
  -f "/tmp/mandoob-bootstrap/$(basename "$RECOVERY_VERIFY_FILE")"
success_before_replay="$(recovery_content_digest pro_access_recovery_success)"
expect_recovery_failure \
  pro_access_recovery_success \
  PRODUCTION_PRO_RECOVERY_TARGET_STATE_CHANGED
success_after_replay="$(recovery_content_digest pro_access_recovery_success)"
[[ "$success_after_replay" == "$success_before_replay" ]] \
  || fail 'migration 0087 replay failure partially mutated the successful state'
docker exec "$CONTAINER_NAME" \
  psql -X --set ON_ERROR_STOP=1 -U supabase_admin -d pro_access_recovery_success \
  -f "/tmp/mandoob-bootstrap/$(basename "$RECOVERY_VERIFY_FILE")"

docker exec "$CONTAINER_NAME" \
  psql -X --set ON_ERROR_STOP=1 -U supabase_admin -d pro_access_recovery_recovery \
  -c "insert into public.pro_profiles (profile_id) values ('10000000-0000-4000-8000-000000000002')"
invalid_before="$(recovery_content_digest pro_access_recovery_recovery)"
expect_recovery_failure \
  pro_access_recovery_recovery \
  PRODUCTION_PRO_RECOVERY_TARGET_STATE_CHANGED
invalid_after="$(recovery_content_digest pro_access_recovery_recovery)"
[[ "$invalid_after" == "$invalid_before" ]] \
  || fail 'migration 0087 invalid-precondition failure partially mutated state'
docker exec "$CONTAINER_NAME" \
  psql -X --set ON_ERROR_STOP=1 -U supabase_admin -d pro_access_recovery_recovery \
  -c "delete from public.pro_profiles where profile_id = '10000000-0000-4000-8000-000000000002'"
docker exec "$CONTAINER_NAME" \
  psql -X --set ON_ERROR_STOP=1 -U supabase_admin -d pro_access_recovery_recovery \
  -f "/tmp/mandoob-migrations/$PRODUCTION_RECOVERY_MIGRATION"
docker exec "$CONTAINER_NAME" \
  psql -X --set ON_ERROR_STOP=1 -U supabase_admin -d pro_access_recovery_recovery \
  -f "/tmp/mandoob-bootstrap/$(basename "$RECOVERY_VERIFY_FILE")"
echo 'PRO_ACCESS_RECOVERY_OK success=1 replay_fail_closed=1 invalid_rollback=1 recovered=1'

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
