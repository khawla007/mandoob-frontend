-- Installed definitions/grants; dedicated local fixture/races use the sibling .mjs.
begin;
do $$
declare
  v_signature regprocedure;
  v_definition text;
  v_role text;
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
    if v_definition not like E'%\nbegin\n  perform private.lock_pro_evidence_actor_first(%' then
      raise exception 'EVIDENCE_PROFILE_FIRST_GUARD_MISSING: %', v_signature;
    end if;
    foreach v_role in array array['anon', 'authenticated'] loop
      if pg_catalog.has_function_privilege(v_role, v_signature, 'EXECUTE') then
        raise exception 'UNEXPECTED_EVIDENCE_RPC_GRANT: %, %', v_role, v_signature;
      end if;
    end loop;
    if not pg_catalog.has_function_privilege('service_role', v_signature, 'EXECUTE') then
      raise exception 'SERVICE_EVIDENCE_RPC_GRANT_MISSING: %', v_signature;
    end if;
  end loop;
  foreach v_role in array array['anon', 'authenticated', 'service_role'] loop
    if pg_catalog.has_function_privilege(v_role,
      'private.lock_pro_evidence_actor_first(uuid,uuid,uuid,boolean)', 'EXECUTE') then
      raise exception 'PRIVATE_EVIDENCE_LOCK_HELPER_EXPOSED: %', v_role;
    end if;
  end loop;
  select pg_catalog.pg_get_functiondef('public.read_company_onboarding(uuid,uuid,uuid)'::regprocedure)
    into v_definition;
  if v_definition not like '%company.status not in (''suspended'', ''churned'')%'
     or v_definition not like '%tenant.status in (''pending'', ''unassigned'', ''active'')%'
     or v_definition not like '%public.has_current_pro_credential(assignment.pro_profile_id)%' then
    raise exception 'ONBOARDING_FRESH_STATUS_OR_CURRENT_CREDENTIAL_GUARD_MISSING';
  end if;
end;
$$;
rollback;
