#!/usr/bin/env bash
set -euo pipefail

test_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
runner="${test_dir}/run_company_assignment_concurrency.sh"
stub_bin="${test_dir}/company_assignment_concurrency_stubs"
test_tmp="$(mktemp -d)"

cleanup_test() {
  trap - EXIT
  rm -rf -- "${test_tmp}"
}
trap cleanup_test EXIT

run_case() {
  local name="$1" expected_status="$2"
  shift 2
  local log="${test_tmp}/${name}.log"
  local output_file="${test_tmp}/${name}.output"
  local status

  set +e
  env PATH="${stub_bin}:${PATH}" DATABASE_URL=stub STUB_LOG="${log}" "$@" \
    "${runner}" >"${output_file}" 2>&1
  status=$?
  set -e

  if [[ "${status}" -ne "${expected_status}" ]]; then
    printf 'FAIL %s: expected status %s, got %s\n' "${name}" "${expected_status}" "${status}" >&2
    sed -n '1,120p' "${output_file}" >&2
    exit 1
  fi
  if [[ "$(grep -cx 'company_assignment_concurrency_teardown.sql' "${log}" || true)" -ne 1 ]]; then
    printf 'FAIL %s: teardown did not run exactly once\n' "${name}" >&2
    exit 1
  fi
}

run_case success_teardown_success 0 env STUB_TEARDOWN_STATUS=0

run_case success_teardown_failure 23 env STUB_TEARDOWN_STATUS=23
grep -q 'teardown failed with status 23' "${test_tmp}/success_teardown_failure.output"

run_case main_and_teardown_failure 17 env STUB_SETUP_STATUS=17 STUB_TEARDOWN_STATUS=23
grep -q 'teardown failed with status 23' "${test_tmp}/main_and_teardown_failure.output"

run_case main_failure_teardown_success 17 env STUB_SETUP_STATUS=17 STUB_TEARDOWN_STATUS=0
if grep -q 'teardown failed' "${test_tmp}/main_failure_teardown_success.output"; then
  printf 'FAIL main_failure_teardown_success: reported a successful teardown as failed\n' >&2
  exit 1
fi

child_log="${test_tmp}/active-child.log"
run_case active_child_cleanup 19 env STUB_WAIT_STATUS=19 STUB_BLOCK_SESSION_A=1 \
  STUB_CHILD_LOG="${child_log}"
grep -q '^terminated$' "${child_log}"

printf 'company assignment concurrency runner behavior: PASS\n'
