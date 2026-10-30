begin;

-- Preserve the reconciled caller policy and complete masked snapshot contract.
-- Put fresh lifecycle status predicates on the actual scoped snapshot query.
do $$
declare
  v_signature regprocedure := 'public.read_company_onboarding(uuid,uuid,uuid)'::regprocedure;
  v_definition text;
  v_replaced text;
begin
  select pg_catalog.pg_get_functiondef(v_signature) into v_definition;
  v_replaced := pg_catalog.replace(
    v_definition,
    'where company.id = p_company_id and company.tenant_id = p_tenant_id;',
    $guard$where company.id = p_company_id and company.tenant_id = p_tenant_id
    and company.status not in ('suspended', 'churned')
    and exists (
      select 1 from public.tenants tenant
      where tenant.id = company.tenant_id
        and tenant.status in ('pending', 'unassigned', 'active')
    );$guard$
  );
  if v_replaced = v_definition then
    raise exception 'ONBOARDING_BOUNDARY_REWRITE_MISSED';
  end if;
  execute v_replaced;
end;
$$;

-- All credential lifecycle mutations use ordered actor/target profiles first.
-- The owner lookup is non-locking; identity and authorization are checked again
-- after acquiring the credential mutex. No reservation/replay semantics change.
create or replace function private.lock_pro_evidence_actor_first(
  p_actor_id uuid, p_credential_id uuid,
  p_expected_owner uuid default null, p_operator_only boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
  v_locked_owner uuid;
  v_operator public.profiles%rowtype;
begin
  select pro_profile_id into v_owner
  from public.pro_credentials where id = p_credential_id;
  if not found or (p_expected_owner is not null and v_owner <> p_expected_owner) then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND';
  end if;
  if p_operator_only then
    -- Recovery intentionally survives a target PRO suspension/role change.
    perform 1 from public.profiles
    where id in (p_actor_id, v_owner) order by id for update;
    select * into v_operator from public.profiles where id = p_actor_id;
    if not found or v_operator.role not in ('admin', 'super_admin')
       or v_operator.status <> 'active' or v_operator.tenant_id is not null then
      raise exception using errcode = 'P0001', message = 'FORBIDDEN';
    end if;
  else
  begin
    perform public.assert_pro_lifecycle_actor(p_actor_id, v_owner, p_operator_only);
  exception when sqlstate 'P0001' then
    if sqlerrm = 'FORBIDDEN' then
      raise exception using errcode = 'P0001', message = 'NOT_FOUND';
    end if;
    raise;
  end;
  end if;
  select pro_profile_id into v_locked_owner
  from public.pro_credentials where id = p_credential_id
  for update;
  if not found or v_locked_owner is distinct from v_owner then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND';
  end if;
  if p_operator_only then
    select * into v_operator from public.profiles where id = p_actor_id;
    if not found or v_operator.role not in ('admin', 'super_admin')
       or v_operator.status <> 'active' or v_operator.tenant_id is not null then
      raise exception using errcode = 'P0001', message = 'FORBIDDEN';
    end if;
  else
  begin
    perform public.authorize_pro_lifecycle_actor(p_actor_id, v_owner, p_operator_only);
  exception when sqlstate 'P0001' then
    if sqlerrm = 'FORBIDDEN' then
      raise exception using errcode = 'P0001', message = 'NOT_FOUND';
    end if;
    raise;
  end;
  end if;
end;
$$;
alter function private.lock_pro_evidence_actor_first(uuid, uuid, uuid, boolean) owner to postgres;
revoke all on function private.lock_pro_evidence_actor_first(uuid, uuid, uuid, boolean)
  from public, anon, authenticated, service_role;

-- Wrappers and upload finalizer otherwise retain their installed definitions,
-- including private delegation, reservation leases, and terminal replay identity.
-- CREATE OR REPLACE preserves each function's existing owner and execute grants.
do $$
declare
  v_signature regprocedure;
  v_definition text;
  v_replaced text;
  v_guard text;
begin
  foreach v_signature in array array[
    'public.prepare_pro_credential_evidence_upload(uuid,uuid,bigint,uuid,text,uuid,text,text,bigint,text,text,text,timestamptz)'::regprocedure,
    'public.prepare_pro_credential_evidence_removal(uuid,uuid,uuid,bigint,uuid,text)'::regprocedure,
    'public.finalize_pro_credential_evidence_upload(uuid,uuid,bigint,uuid,text,uuid,text,text,bigint,text,text,text,timestamptz)'::regprocedure,
    'public.finalize_pro_credential_evidence_removal(uuid,uuid,uuid,bigint,uuid,text)'::regprocedure,
    'public.claim_pro_credential_evidence_removal_recovery(uuid,uuid,uuid,uuid,uuid)'::regprocedure,
    'public.finalize_pro_credential_evidence_removal_recovery(uuid,uuid,uuid,uuid,uuid)'::regprocedure
  ] loop
    select pg_catalog.pg_get_functiondef(v_signature) into v_definition;
    if v_signature in (
      'public.claim_pro_credential_evidence_removal_recovery(uuid,uuid,uuid,uuid,uuid)'::regprocedure,
      'public.finalize_pro_credential_evidence_removal_recovery(uuid,uuid,uuid,uuid,uuid)'::regprocedure
    ) then
      v_guard := E'\nbegin\n  perform private.lock_pro_evidence_actor_first(p_actor_id, p_credential_id, p_pro_profile_id, true);\n';
    else
      v_guard := E'\nbegin\n  perform private.lock_pro_evidence_actor_first(p_actor_id, p_credential_id);\n';
    end if;
    v_replaced := pg_catalog.regexp_replace(v_definition, E'\nbegin\n', v_guard, 'i');
    if v_replaced = v_definition or v_definition like '%lock_pro_evidence_actor_first%' then
      raise exception 'EVIDENCE_BOUNDARY_REWRITE_MISSED: %', v_signature;
    end if;
    execute v_replaced;
  end loop;
end;
$$;

commit;
