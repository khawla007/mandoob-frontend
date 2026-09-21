#!/usr/bin/env bash
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL is required}"
test_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
run_dir="$(mktemp -d)"
holder_pid=""
psql=(psql "${DATABASE_URL}" -X --set=ON_ERROR_STOP=1)

cleanup() {
  local status=$?
  trap - EXIT INT TERM
  if [[ -n "${holder_pid}" ]] && kill -0 "${holder_pid}" 2>/dev/null; then
    kill "${holder_pid}" 2>/dev/null || true
    wait "${holder_pid}" 2>/dev/null || true
  fi
  set +e
  timeout 30s "${psql[@]}" \
    -f "${test_dir}/document_request_batch_assignment_contention_teardown.sql"
  local teardown_status=$?
  set -e
  rm -rf "${run_dir}"
  if ((status == 0 && teardown_status != 0)); then status=${teardown_status}; fi
  exit "${status}"
}
trap cleanup EXIT INT TERM

timeout 30s "${psql[@]}" \
  -f "${test_dir}/document_request_batch_assignment_contention_teardown.sql"
timeout 30s "${psql[@]}" \
  -f "${test_dir}/document_request_batch_assignment_contention_setup.sql"

timeout 30s "${psql[@]}" \
  -f "${test_dir}/document_request_batch_assignment_contention_holder.sql" \
  >"${run_dir}/holder.log" 2>&1 &
holder_pid=$!
for _ in $(seq 1 100); do
  if rg -q 'BATCH_CANONICAL_LOCK_HELD' "${run_dir}/holder.log"; then break; fi
  if ! kill -0 "${holder_pid}" 2>/dev/null; then
    echo 'holder ended before lock barrier' >&2
    exit 1
  fi
  sleep 0.05
done
rg -q 'BATCH_CANONICAL_LOCK_HELD' "${run_dir}/holder.log"

timeout 30s "${psql[@]}" \
  -f "${test_dir}/document_request_batch_assignment_contention_release.sql" \
  >"${run_dir}/release.log" 2>&1
wait "${holder_pid}"
holder_pid=""
rg -q 'BATCH_SESSION_COMMITTED' "${run_dir}/holder.log"
rg -q 'RELEASE_SESSION_COMMITTED' "${run_dir}/release.log"

result=$(timeout 30s "${psql[@]}" -Atc "select case when
  (select count(*) from public.document_request_batch_operations where operation_id='99030771-0000-4000-8000-000000000900')=1
  and (select count(*) from public.document_requests where tenant_id='99030771-0000-4000-8000-000000000100')=2
  and not exists(select 1 from public.pro_company_assignments where company_id='99030771-0000-4000-8000-000000000101' and status='active')
  and (select count(*) from public.pro_company_assignments where company_id='99030771-0000-4000-8000-000000000101' and status='released')=1
  then 'NO_DEADLOCK_OR_TIMEOUT' else 'CONTENTION_INVARIANT_FAILED' end")
test "${result}" = 'NO_DEADLOCK_OR_TIMEOUT'
echo 'NO_DEADLOCK_OR_TIMEOUT'
