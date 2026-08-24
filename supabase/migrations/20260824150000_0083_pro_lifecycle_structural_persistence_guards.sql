begin;

create or replace function public.assert_safe_pro_decision_reason(
  p_reason_code text,
  p_reason text
)
returns void
language plpgsql
immutable
security definer
set search_path = ''
as $$
begin
  if pg_catalog.btrim(p_reason_code) !~ '^[A-Z][A-Z0-9_]{1,63}$'
     or pg_catalog.char_length(pg_catalog.btrim(p_reason)) not between 3 and 500
     or p_reason ~ '[[:cntrl:]]'
     or p_reason ~* '(pro-credentials/|storage_?path|identifier_(ciphertext|hash)|sha256|sqlstate)'
     or p_reason ~* '[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}' then
    raise exception using errcode = 'P0001', message = 'INVALID_DECISION_REASON';
  end if;
end;
$$;

create or replace function public.assert_safe_pro_lifecycle_result(
  p_entity_kind public.pro_lifecycle_operation_kind,
  p_result jsonb
)
returns void
language plpgsql
immutable
security definer
set search_path = ''
as $$
begin
  if pg_catalog.jsonb_typeof(p_result) <> 'object' then
    raise exception using errcode = 'P0001', message = 'UNSAFE_LIFECYCLE_RESULT';
  end if;

  if p_entity_kind = 'credential' then
    if not p_result ?& array['credentialId', 'type', 'state', 'version']
       or exists (
         select 1 from pg_catalog.jsonb_object_keys(p_result) result_key
         where result_key <> all (array[
           'credentialId', 'type', 'maskedIdentifier', 'issuingAuthority', 'issueDate',
           'expiryDate', 'state', 'version', 'evidenceCount', 'submittedAt',
           'supersedesCredentialId'
         ]::text[])
       )
       or p_result ->> 'type' <> 'pro_license'
       or (
         p_result ? 'maskedIdentifier'
         and p_result ->> 'maskedIdentifier' is not null
         and p_result ->> 'maskedIdentifier' !~ '^•••• [A-Z0-9]{4}$'
       ) then
      raise exception using errcode = 'P0001', message = 'UNSAFE_LIFECYCLE_RESULT';
    end if;
  elsif p_entity_kind = 'commercial_term' then
    if not p_result ?& array['termId', 'termKind', 'status', 'version']
       or exists (
         select 1 from pg_catalog.jsonb_object_keys(p_result) result_key
         where result_key <> all (array[
           'termId', 'termKind', 'model', 'currency', 'amountMinor', 'retainerInterval',
           'scope', 'effectiveFrom', 'effectiveTo', 'status', 'version'
         ]::text[])
       ) then
      raise exception using errcode = 'P0001', message = 'UNSAFE_LIFECYCLE_RESULT';
    end if;
  else
    raise exception using errcode = 'P0001', message = 'UNSAFE_LIFECYCLE_RESULT';
  end if;
end;
$$;

alter function public.assert_safe_pro_decision_reason(text, text) owner to postgres;
alter function public.assert_safe_pro_lifecycle_result(public.pro_lifecycle_operation_kind, jsonb)
  owner to postgres;

revoke all on function public.assert_safe_pro_decision_reason(text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.assert_safe_pro_lifecycle_result(
  public.pro_lifecycle_operation_kind, jsonb
) from public, anon, authenticated, service_role;

commit;
