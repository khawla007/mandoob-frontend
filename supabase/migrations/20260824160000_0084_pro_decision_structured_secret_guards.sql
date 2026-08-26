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
     or p_reason ~* '(pro-credentials/|storage_path|identifier_ciphertext|sqlstate)'
     or p_reason ~* '(^|[^[:alnum:]])v[0-9]+:[A-Za-z0-9+/]{16}:[A-Za-z0-9+/]{22}==:[A-Za-z0-9+/]+={0,2}($|[^[:alnum:]])'
     or p_reason ~* 'https?://[^[:space:]]+/storage/v1/object/sign/[^[:space:]?]+[?&][^[:space:]]*(token|signature|x-amz-signature)='
     or p_reason ~* '(identifier[ _-]*hash|sha-?256)[[:space:]]*[:=][[:space:]]*[0-9a-f]{64}'
     or p_reason ~* '(raw[ _-]*provider[ _-]*error|provider[ _-]*error[[:space:]]*[:=])'
     or p_reason ~* '[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}' then
    raise exception using errcode = 'P0001', message = 'INVALID_DECISION_REASON';
  end if;
end;
$$;

alter function public.assert_safe_pro_decision_reason(text, text) owner to postgres;
revoke all on function public.assert_safe_pro_decision_reason(text, text)
  from public, anon, authenticated, service_role;

commit;
