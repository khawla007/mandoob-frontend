#!/usr/bin/env bash
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL is required}"
test_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
psql=(psql "${DATABASE_URL}" -X --set=ON_ERROR_STOP=1)
timeout 120s "${psql[@]}" -f "${test_dir}/company_assignment_concurrency_setup.sql"

run_pair() {
  local label="$1" file_a="$2" file_b="$3"
  shift 3
  echo "running ${label}"
  timeout 120s "${psql[@]}" "$@" -f "${test_dir}/${file_a}" &
  local first_pid=$!
  sleep 1
  timeout 120s "${psql[@]}" "$@" -f "${test_dir}/${file_b}"
  wait "${first_pid}"
}

actor_a=95000000-0000-4000-8000-000000000001
actor_b=95000000-0000-4000-8000-000000000002
run_pair one-pro company_assignment_concurrency_session_a.sql company_assignment_concurrency_session_b.sql \
  -v company_a_id=95000000-0000-4000-8000-000000000031 -v company_b_id=95000000-0000-4000-8000-000000000032 \
  -v pro_a_profile_id=95000000-0000-4000-8000-000000000011 -v pro_b_profile_id=95000000-0000-4000-8000-000000000011 \
  -v actor_a_profile_id="$actor_a" -v actor_b_profile_id="$actor_b" -v expected_error=PRO_ALREADY_ASSIGNED
run_pair one-company company_assignment_concurrency_session_a.sql company_assignment_concurrency_session_b.sql \
  -v company_a_id=95000000-0000-4000-8000-000000000033 -v company_b_id=95000000-0000-4000-8000-000000000033 \
  -v pro_a_profile_id=95000000-0000-4000-8000-000000000012 -v pro_b_profile_id=95000000-0000-4000-8000-000000000013 \
  -v actor_a_profile_id="$actor_a" -v actor_b_profile_id="$actor_b" -v expected_error=COMPANY_ALREADY_ASSIGNED

release_id=$("${psql[@]}" -Atc "select assignment_id from public.assignment_concurrency_fixture_ids where fixture='release-assign'")
run_pair release-assign company_assignment_release_assign_session_a.sql company_assignment_release_assign_session_b.sql \
  -v company_id=95000000-0000-4000-8000-000000000034 -v assignment_id="$release_id" \
  -v replacement_pro_profile_id=95000000-0000-4000-8000-000000000017 \
  -v actor_a_profile_id="$actor_a" -v actor_b_profile_id="$actor_b"

swap_a=$("${psql[@]}" -Atc "select assignment_id from public.assignment_concurrency_fixture_ids where fixture='swap-a'")
swap_b=$("${psql[@]}" -Atc "select assignment_id from public.assignment_concurrency_fixture_ids where fixture='swap-b'")
run_pair swap-reassign company_assignment_swap_reassign_session_a.sql company_assignment_swap_reassign_session_b.sql \
  -v company_a_id=95000000-0000-4000-8000-000000000035 -v company_b_id=95000000-0000-4000-8000-000000000036 \
  -v assignment_a_id="$swap_a" -v assignment_b_id="$swap_b" \
  -v pro_a_profile_id=95000000-0000-4000-8000-000000000015 -v pro_b_profile_id=95000000-0000-4000-8000-000000000016 \
  -v actor_a_profile_id="$actor_a" -v actor_b_profile_id="$actor_b" -v expected_error=PRO_ALREADY_ASSIGNED
