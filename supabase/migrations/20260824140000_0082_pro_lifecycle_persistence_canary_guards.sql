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
     or p_reason ~* '(https?://|signed[_ -]?url|raw[_ -]?(provider[_ -]?)?error|provider[_ -]?error)'
     or p_reason ~* '(^|[^[:alpha:]])identifier([^[:alpha:]]|$)'
     or p_reason ~* '(^|[^[:alnum:]])v[0-9]+:'
     or p_reason ~* '(^|[^0-9a-f])[0-9a-f]{64}([^0-9a-f]|$)'
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
declare
  v_serialized text := p_result::text;
begin
  if pg_catalog.jsonb_typeof(p_result) <> 'object' then
    raise exception using errcode = 'P0001', message = 'UNSAFE_LIFECYCLE_RESULT';
  end if;
  if p_entity_kind = 'credential' and exists (
    select 1 from pg_catalog.jsonb_object_keys(p_result) result_key
    where result_key <> all (array[
      'credentialId', 'type', 'maskedIdentifier', 'issuingAuthority', 'issueDate',
      'expiryDate', 'state', 'version', 'evidenceCount', 'submittedAt',
      'supersedesCredentialId'
    ]::text[])
  ) then
    raise exception using errcode = 'P0001', message = 'UNSAFE_LIFECYCLE_RESULT';
  end if;
  if p_entity_kind = 'commercial_term' and exists (
    select 1 from pg_catalog.jsonb_object_keys(p_result) result_key
    where result_key <> all (array[
      'termId', 'termKind', 'model', 'currency', 'amountMinor', 'retainerInterval',
      'scope', 'effectiveFrom', 'effectiveTo', 'status', 'version'
    ]::text[])
  ) then
    raise exception using errcode = 'P0001', message = 'UNSAFE_LIFECYCLE_RESULT';
  end if;
  if p_result ? 'maskedIdentifier'
     and p_result ->> 'maskedIdentifier' is not null
     and p_result ->> 'maskedIdentifier' !~ '^•••• [A-Z0-9]{4}$' then
    raise exception using errcode = 'P0001', message = 'UNSAFE_LIFECYCLE_RESULT';
  end if;
  if v_serialized ~* '(pro-credentials/|https?://|signed[_ -]?url|raw[_ -]?(provider[_ -]?)?error|provider[_ -]?error)'
     or v_serialized ~* '(identifier_(ciphertext|hash)|storage_?path|sha256)'
     or v_serialized ~* '(^|[^[:alpha:]])identifier([^[:alpha:]]|$)'
     or v_serialized ~* '(^|[^[:alnum:]])v[0-9]+:'
     or v_serialized ~* '(^|[^0-9a-f])[0-9a-f]{64}([^0-9a-f]|$)' then
    raise exception using errcode = 'P0001', message = 'UNSAFE_LIFECYCLE_RESULT';
  end if;
end;
$$;

create or replace function public.store_pro_lifecycle_receipt(
  p_entity_kind public.pro_lifecycle_operation_kind,
  p_entity_id uuid,
  p_operation_id uuid,
  p_payload_hash text,
  p_sanitized_result jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.assert_safe_pro_lifecycle_result(p_entity_kind, p_sanitized_result);
  insert into public.pro_lifecycle_operation_receipts (
    entity_kind, entity_id, operation_id, payload_hash, sanitized_result
  ) values (
    p_entity_kind, p_entity_id, p_operation_id, p_payload_hash, p_sanitized_result
  );
end;
$$;

alter function public.assert_safe_pro_decision_reason(text, text) owner to postgres;
alter function public.assert_safe_pro_lifecycle_result(public.pro_lifecycle_operation_kind, jsonb)
  owner to postgres;
alter function public.store_pro_lifecycle_receipt(
  public.pro_lifecycle_operation_kind, uuid, uuid, text, jsonb
) owner to postgres;

revoke all on function public.assert_safe_pro_lifecycle_result(
  public.pro_lifecycle_operation_kind, jsonb
) from public, anon, authenticated, service_role;
revoke all on function public.assert_safe_pro_decision_reason(text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.store_pro_lifecycle_receipt(
  public.pro_lifecycle_operation_kind, uuid, uuid, text, jsonb
) from public, anon, authenticated, service_role;

commit;
