begin;

create function public.cancel_leased_event_job(
  p_job_id uuid,
  p_worker_id uuid,
  p_lease_token uuid,
  p_error_code text
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.event_jobs%rowtype;
begin
  if p_job_id is null or p_worker_id is null or p_lease_token is null
    or p_error_code is null or p_error_code !~ '^[A-Z][A-Z0-9_]{1,63}$' then
    raise exception using errcode = '22023', message = 'INVALID_CANCELLATION';
  end if;

  select job.* into v_job
  from public.event_jobs as job
  where job.id = p_job_id
  for update;
  if not found
    or v_job.state <> 'leased'
    or v_job.lease_owner is distinct from p_worker_id
    or v_job.lease_token is distinct from p_lease_token
    or v_job.lease_expires_at is null
    or v_job.lease_expires_at <= pg_catalog.clock_timestamp() then
    return false;
  end if;

  update public.event_jobs as job
  set state = 'cancelled',
      lease_owner = null,
      lease_token = null,
      lease_expires_at = null,
      cancelled_at = pg_catalog.now(),
      last_error_category = 'rejected',
      last_error_code = p_error_code,
      updated_at = pg_catalog.now()
  where job.id = v_job.id;

  insert into public.event_job_attempts (
    job_id, attempt_number, transition, worker_id, lease_token, error_category, error_code
  ) values (
    v_job.id, v_job.attempts, 'cancelled', p_worker_id, p_lease_token, 'rejected', p_error_code
  );
  return true;
end;
$$;

revoke all on function public.cancel_leased_event_job(uuid, uuid, uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.cancel_leased_event_job(uuid, uuid, uuid, text) to service_role;

commit;
