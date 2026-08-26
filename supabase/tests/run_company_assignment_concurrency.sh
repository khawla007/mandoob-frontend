#!/usr/bin/env bash
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL is required}"
test_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
active_pid=""
cleanup() {
  local status=$?
  local teardown_status
  trap - EXIT INT TERM
  if [[ -n "${active_pid}" ]] && kill -0 "${active_pid}" 2>/dev/null; then
    kill "${active_pid}" 2>/dev/null || true
    wait "${active_pid}" 2>/dev/null || true
  fi
  set +e
  timeout 120s "${psql[@]}" -f "${test_dir}/company_assignment_concurrency_teardown.sql"
  teardown_status=$?
  set -e
  if ((teardown_status != 0)); then
    printf 'company assignment concurrency teardown failed with status %s\n' \
      "${teardown_status}" >&2
    if ((status == 0)); then
      status="${teardown_status}"
    fi
  fi
  exit "${status}"
}
trap cleanup EXIT INT TERM
psql=(psql "${DATABASE_URL}" -X --set=ON_ERROR_STOP=1)
timeout 120s "${psql[@]}" -f "${test_dir}/company_assignment_concurrency_setup.sql"

run_pair() {
  local label="$1" file_a="$2" file_b="$3" lock_company_id="$4"
  local lock_pro_a_id="$5" lock_pro_b_id="$6"
  local session_a_name="task11-${label}-${BASHPID}-a"
  local session_b_name="task11-${label}-${BASHPID}-b"
  shift 6
  echo "running ${label}"
  timeout 120s "${psql[@]}" "$@" -v session_a_name="${session_a_name}" \
    -v session_b_name="${session_b_name}" -f "${test_dir}/${file_a}" &
  active_pid=$!
  timeout 30s "${psql[@]}" -v session_a_name="${session_a_name}" \
    -v lock_company_id="${lock_company_id}" -v lock_pro_a_id="${lock_pro_a_id}" \
    -v lock_pro_b_id="${lock_pro_b_id}" \
    -f "${test_dir}/company_assignment_wait_for_locks.sql"
  timeout 120s "${psql[@]}" "$@" -v session_a_name="${session_a_name}" \
    -v session_b_name="${session_b_name}" -f "${test_dir}/${file_b}"
  wait "${active_pid}"
  active_pid=""
}

actor_a=95000000-0000-4000-8000-000000000001
actor_b=95000000-0000-4000-8000-000000000002
run_pair one-pro company_assignment_concurrency_session_a.sql company_assignment_concurrency_session_b.sql \
  95000000-0000-4000-8000-000000000031 95000000-0000-4000-8000-000000000011 '' \
  -v company_a_id=95000000-0000-4000-8000-000000000031 -v company_b_id=95000000-0000-4000-8000-000000000032 \
  -v pro_a_profile_id=95000000-0000-4000-8000-000000000011 -v pro_b_profile_id=95000000-0000-4000-8000-000000000011 \
  -v actor_a_profile_id="$actor_a" -v actor_b_profile_id="$actor_b" -v expected_error=PRO_ALREADY_ASSIGNED
run_pair one-company company_assignment_concurrency_session_a.sql company_assignment_concurrency_session_b.sql \
  95000000-0000-4000-8000-000000000033 95000000-0000-4000-8000-000000000012 '' \
  -v company_a_id=95000000-0000-4000-8000-000000000033 -v company_b_id=95000000-0000-4000-8000-000000000033 \
  -v pro_a_profile_id=95000000-0000-4000-8000-000000000012 -v pro_b_profile_id=95000000-0000-4000-8000-000000000013 \
  -v actor_a_profile_id="$actor_a" -v actor_b_profile_id="$actor_b" -v expected_error=COMPANY_ALREADY_ASSIGNED

release_id=$("${psql[@]}" -Atc "select id from public.pro_company_assignments where company_id='95000000-0000-4000-8000-000000000034' and status='active'")
run_pair release-assign company_assignment_release_assign_session_a.sql company_assignment_release_assign_session_b.sql \
  95000000-0000-4000-8000-000000000034 95000000-0000-4000-8000-000000000014 '' \
  -v company_id=95000000-0000-4000-8000-000000000034 -v assignment_id="$release_id" \
  -v replacement_pro_profile_id=95000000-0000-4000-8000-000000000017 \
  -v actor_a_profile_id="$actor_a" -v actor_b_profile_id="$actor_b"

swap_a=$("${psql[@]}" -Atc "select id from public.pro_company_assignments where company_id='95000000-0000-4000-8000-000000000035' and status='active'")
swap_b=$("${psql[@]}" -Atc "select id from public.pro_company_assignments where company_id='95000000-0000-4000-8000-000000000036' and status='active'")
run_pair swap-reassign company_assignment_swap_reassign_session_a.sql company_assignment_swap_reassign_session_b.sql \
  95000000-0000-4000-8000-000000000035 95000000-0000-4000-8000-000000000015 95000000-0000-4000-8000-000000000016 \
  -v company_a_id=95000000-0000-4000-8000-000000000035 -v company_b_id=95000000-0000-4000-8000-000000000036 \
  -v assignment_a_id="$swap_a" -v assignment_b_id="$swap_b" \
  -v pro_a_profile_id=95000000-0000-4000-8000-000000000015 -v pro_b_profile_id=95000000-0000-4000-8000-000000000016 \
  -v actor_a_profile_id="$actor_a" -v actor_b_profile_id="$actor_b" -v expected_error=PRO_ALREADY_ASSIGNED
