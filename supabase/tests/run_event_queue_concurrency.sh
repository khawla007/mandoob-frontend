#!/usr/bin/env bash
set -euo pipefail

: "${EVENT_QUEUE_DB_CONTAINER:?EVENT_QUEUE_DB_CONTAINER is required}"

psql_cmd=(
  docker exec "${EVENT_QUEUE_DB_CONTAINER}"
  psql -X -U postgres -d postgres -v ON_ERROR_STOP=1
)
scratch_dir="$(mktemp -d /tmp/mandoob-event-queue-concurrency-XXXXXXXX)"

read -r -d '' cleanup_sql <<'SQL' || true
begin;
set constraints all deferred;
alter table public.event_job_attempts disable trigger event_job_attempts_immutable;
alter table public.event_replay_requests disable trigger event_replay_requests_immutable;
alter table public.domain_events disable trigger domain_events_immutable;
update public.event_jobs
set replay_request_id = null
where event_id in (select id from public.domain_events where event_type = 'p3_10.concurrent');
delete from public.event_job_attempts
where job_id in (
  select id from public.event_jobs
  where event_id in (select id from public.domain_events where event_type = 'p3_10.concurrent')
);
delete from public.event_replay_requests
where source_job_id in (
  select id from public.event_jobs
  where event_id in (select id from public.domain_events where event_type = 'p3_10.concurrent')
);
delete from public.event_jobs
where event_id in (select id from public.domain_events where event_type = 'p3_10.concurrent');
delete from public.domain_events where event_type = 'p3_10.concurrent';
alter table public.event_job_attempts enable trigger event_job_attempts_immutable;
alter table public.event_replay_requests enable trigger event_replay_requests_immutable;
alter table public.domain_events enable trigger domain_events_immutable;
delete from public.event_consumer_registrations
where consumer_name = 'p3_10.concurrent.worker' and event_type = 'p3_10.concurrent';
delete from public.event_contract_registrations
where event_type = 'p3_10.concurrent' and event_version = 1;
delete from public.profiles where id = '93200000-0000-4000-8000-000000000001';
delete from auth.users where id = '93200000-0000-4000-8000-000000000001';
commit;
SQL

cleanup() {
  local status=$?
  local cleanup_status
  trap - EXIT INT TERM
  set +e
  "${psql_cmd[@]}" -q -c "${cleanup_sql}" >/dev/null
  cleanup_status=$?
  rm -rf "${scratch_dir}"
  set -e
  if ((status == 0 && cleanup_status != 0)); then
    status=${cleanup_status}
  fi
  exit "${status}"
}
trap cleanup EXIT INT TERM

"${psql_cmd[@]}" -q -c "${cleanup_sql}" >/dev/null

read -r -d '' setup_sql <<'SQL' || true
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '93200000-0000-4000-8000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'event-race@example.invalid', 'synthetic', pg_catalog.now(),
  '{}', '{}', pg_catalog.now(), pg_catalog.now()
);
insert into public.profiles (id, role, status, full_name)
values ('93200000-0000-4000-8000-000000000001', 'admin', 'active', 'Event Race Admin');
insert into public.event_contract_registrations (event_type, event_version, payload_schema)
values ('p3_10.concurrent', 1, '{"sequence":"integer"}');
insert into public.event_consumer_registrations (
  consumer_name, event_type, event_version, max_attempts, default_lease_seconds
) values ('p3_10.concurrent.worker', 'p3_10.concurrent', 1, 3, 15);
select public.publish_domain_event(
  '93200000-0000-4000-8000-000000000101', 'p3_10.concurrent', 1::smallint,
  pg_catalog.now(), null, null, null, '93200000-0000-4000-8000-000000000201', null,
  'internal', '{"sequence":1}', repeat('1', 64)
);
select public.publish_domain_event(
  '93200000-0000-4000-8000-000000000102', 'p3_10.concurrent', 1::smallint,
  pg_catalog.now(), null, null, null, '93200000-0000-4000-8000-000000000202', null,
  'internal', '{"sequence":2}', repeat('2', 64)
);
select public.publish_domain_event(
  '93200000-0000-4000-8000-000000000103', 'p3_10.concurrent', 1::smallint,
  pg_catalog.now(), null, null, null, '93200000-0000-4000-8000-000000000203', null,
  'internal', '{"sequence":3}', repeat('3', 64)
);
select public.publish_domain_event(
  '93200000-0000-4000-8000-000000000104', 'p3_10.concurrent', 1::smallint,
  pg_catalog.now(), null, null, null, '93200000-0000-4000-8000-000000000204', null,
  'internal', '{"sequence":4}', repeat('4', 64)
);
select public.publish_domain_event(
  '93200000-0000-4000-8000-000000000105', 'p3_10.concurrent', 1::smallint,
  pg_catalog.now(), null, null, null, '93200000-0000-4000-8000-000000000205', null,
  'internal', '{"sequence":5}', repeat('5', 64)
);
select public.publish_domain_event(
  ('93200000-0000-4000-8000-' || pg_catalog.lpad((100 + value)::text, 12, '0'))::uuid,
  'p3_10.concurrent', 1::smallint, pg_catalog.now(), null, null, null,
  ('93200000-0000-4000-8000-' || pg_catalog.lpad((200 + value)::text, 12, '0'))::uuid,
  null, 'internal', pg_catalog.jsonb_build_object('sequence', value),
  encode(extensions.digest(pg_catalog.convert_to(value::text, 'UTF8'), 'sha256'), 'hex')
)
from pg_catalog.generate_series(6, 10) value;
SQL
"${psql_cmd[@]}" -q -c "${setup_sql}" >/dev/null

claim_query_a="select job_id, lease_token, attempt_number from public.claim_event_jobs('93200000-0000-4000-8000-000000000301', 'p3_10.concurrent.worker', 2, 15)"
claim_query_b="select job_id, lease_token, attempt_number from public.claim_event_jobs('93200000-0000-4000-8000-000000000302', 'p3_10.concurrent.worker', 2, 15)"
"${psql_cmd[@]}" -At -F '|' -c "${claim_query_a}" >"${scratch_dir}/claim-a" &
claim_a_pid=$!
"${psql_cmd[@]}" -At -F '|' -c "${claim_query_b}" >"${scratch_dir}/claim-b" &
claim_b_pid=$!
wait "$claim_a_pid"
wait "$claim_b_pid"

if [[ "$(wc -l <"${scratch_dir}/claim-a")" -ne 2 || "$(wc -l <"${scratch_dir}/claim-b")" -ne 2 ]]; then
  printf 'workers did not each claim the bounded two-job batch\n' >&2
  exit 1
fi
if comm -12 \
  <(cut -d '|' -f 1 "${scratch_dir}/claim-a" | sort) \
  <(cut -d '|' -f 1 "${scratch_dir}/claim-b" | sort) | grep -q .; then
  printf 'workers claimed an overlapping job\n' >&2
  exit 1
fi

IFS='|' read -r crash_job crash_token crash_attempt <"${scratch_dir}/claim-a"
if [[ "${crash_attempt}" != "1" ]]; then
  printf 'initial claim did not record attempt one\n' >&2
  exit 1
fi

set +e
"${psql_cmd[@]}" -c "select public.complete_event_job('${crash_job}', '93200000-0000-4000-8000-000000000399', '${crash_token}', null);" \
  >"${scratch_dir}/stale-owner.out" 2>&1
stale_owner_status=$?
set -e
if ((stale_owner_status == 0)) || ! grep -q 'STALE_EVENT_JOB_LEASE' "${scratch_dir}/stale-owner.out"; then
  printf 'wrong-owner stale completion was not fenced\n' >&2
  exit 1
fi

"${psql_cmd[@]}" -q -c "update public.event_jobs set lease_expires_at = pg_catalog.now() - interval '1 second' where id = '${crash_job}';" >/dev/null
"${psql_cmd[@]}" -At -F '|' -c \
  "select job_id, lease_token, attempt_number from public.claim_event_jobs('93200000-0000-4000-8000-000000000303', 'p3_10.concurrent.worker', 1, 15)" \
  >"${scratch_dir}/recovered"
IFS='|' read -r recovered_job recovered_token recovered_attempt <"${scratch_dir}/recovered"
if [[ "${recovered_job}" != "${crash_job}" || "${recovered_attempt}" != "2" ]]; then
  printf 'expired lease was not reclaimed deterministically\n' >&2
  exit 1
fi

set +e
"${psql_cmd[@]}" -c "select public.complete_event_job('${crash_job}', '93200000-0000-4000-8000-000000000301', '${crash_token}', null);" \
  >"${scratch_dir}/stale-token.out" 2>&1
stale_token_status=$?
set -e
if ((stale_token_status == 0)) || ! grep -q 'STALE_EVENT_JOB_LEASE' "${scratch_dir}/stale-token.out"; then
  printf 'reclaimed lease accepted the old token\n' >&2
  exit 1
fi
"${psql_cmd[@]}" -q -c "select public.complete_event_job('${recovered_job}', '93200000-0000-4000-8000-000000000303', '${recovered_token}', null);" >/dev/null

IFS='|' read -r effect_job effect_token effect_attempt <"${scratch_dir}/claim-b"
"${psql_cmd[@]}" -q -c "select public.complete_event_job('${effect_job}', '93200000-0000-4000-8000-000000000302', '${effect_token}', repeat('e', 64));" >/dev/null
set +e
"${psql_cmd[@]}" -c "select public.complete_event_job('${effect_job}', '93200000-0000-4000-8000-000000000302', '${effect_token}', repeat('e', 64));" \
  >"${scratch_dir}/after-effect.out" 2>&1
after_effect_status=$?
set -e
if ((after_effect_status == 0)) || ! grep -q 'STALE_EVENT_JOB_LEASE' "${scratch_dir}/after-effect.out"; then
  printf 'post-effect duplicate completion was not fenced\n' >&2
  exit 1
fi
if [[ "$("${psql_cmd[@]}" -Atc "select effect_reference_hash from public.event_jobs where id = '${effect_job}'")" != "$(printf 'e%.0s' {1..64})" ]]; then
  printf 'safe external-effect reference was not retained\n' >&2
  exit 1
fi

"${psql_cmd[@]}" -q -c "update public.event_jobs set state = 'leased', attempts = 3, max_attempts = 3, lease_owner = '93200000-0000-4000-8000-000000000398', lease_token = gen_random_uuid(), lease_expires_at = pg_catalog.now() - interval '1 second' where event_id in (select id from public.domain_events where event_type = 'p3_10.concurrent' and (payload ->> 'sequence')::integer between 6 and 10);" >/dev/null
"${psql_cmd[@]}" -q -c "select * from public.claim_event_jobs('93200000-0000-4000-8000-000000000304', 'p3_10.concurrent.worker', 2, 15);" >/dev/null
if [[ "$("${psql_cmd[@]}" -Atc "select count(*) from public.event_jobs job join public.domain_events event on event.id = job.event_id where event.event_type = 'p3_10.concurrent' and (event.payload ->> 'sequence')::integer between 6 and 10 and job.state = 'dead'")" != "2" ]]; then
  printf 'expired lease exhaustion exceeded the bounded cleanup batch\n' >&2
  exit 1
fi

"${psql_cmd[@]}" -q -c "insert into public.event_jobs (id, event_id, consumer_name, state, attempts, max_attempts, last_error_category, last_error_code, dead_at) values ('93200000-0000-4000-8000-000000000401', '93200000-0000-4000-8000-000000000105', 'manual.replay', 'dead', 1, 1, 'malformed_payload', 'EVENT_PAYLOAD_INVALID', pg_catalog.now());" >/dev/null
replay_prefix="set request.jwt.claims = '{\"sub\":\"93200000-0000-4000-8000-000000000001\",\"role\":\"authenticated\",\"aal\":\"aal2\"}'; set role authenticated;"
set +e
(
  "${psql_cmd[@]}" -Atc "${replay_prefix} select public.request_event_job_replay('93200000-0000-4000-8000-000000000401', '93200000-0000-4000-8000-000000000411', 'Concurrent recovery request same operation');" \
    >"${scratch_dir}/replay-a.out" 2>"${scratch_dir}/replay-a.err"
  printf '%s\n' "$?" >"${scratch_dir}/replay_a_status"
) &
replay_a_pid=$!
(
  "${psql_cmd[@]}" -Atc "${replay_prefix} select public.request_event_job_replay('93200000-0000-4000-8000-000000000401', '93200000-0000-4000-8000-000000000411', 'Concurrent recovery request same operation');" \
    >"${scratch_dir}/replay-b.out" 2>"${scratch_dir}/replay-b.err"
  printf '%s\n' "$?" >"${scratch_dir}/replay_b_status"
) &
replay_b_pid=$!
wait "${replay_a_pid}"
wait "${replay_b_pid}"
set -e

replay_statuses="$(sort "${scratch_dir}/replay_a_status" "${scratch_dir}/replay_b_status" | tr '\n' ' ')"
if [[ "${replay_statuses}" != "0 0 " ]]; then
  printf 'same-operation concurrent replay was not idempotent\n' >&2
  exit 1
fi
if [[ "$(tail -n 1 "${scratch_dir}/replay-a.out")" != "$(tail -n 1 "${scratch_dir}/replay-b.out")" ]]; then
  printf 'same-operation concurrent replay returned different jobs\n' >&2
  exit 1
fi
if [[ "$("${psql_cmd[@]}" -Atc "select count(*) from public.event_jobs where replay_of_job_id = '93200000-0000-4000-8000-000000000401' and state = 'replayed'")" != "1" ]]; then
  printf 'concurrent replay persisted more than one active replay\n' >&2
  exit 1
fi

printf 'event queue concurrency, fencing, recovery, and replay race checks passed\n'
