\set ON_ERROR_STOP on
set statement_timeout = '30s';

begin;

delete from public.rate_limits where key like 'atomic-pair-test:%';

do $atomic_pair_both_allowed$
declare
  v_result jsonb;
  v_first_tokens double precision;
  v_second_tokens double precision;
begin
  v_result := public.rate_limit_consume_pair(
    'atomic-pair-test:allowed:first', 2, 0.000001, 1,
    'atomic-pair-test:allowed:second', 3, 0.000001, 1
  );
  if v_result <> '{"first_allowed":true,"second_allowed":true}'::jsonb then
    raise exception 'ATOMIC_PAIR_ALLOWED_RESULT_INVALID';
  end if;
  select tokens into v_first_tokens from public.rate_limits
  where key = 'atomic-pair-test:allowed:first';
  select tokens into v_second_tokens from public.rate_limits
  where key = 'atomic-pair-test:allowed:second';
  if v_first_tokens <> 1 or v_second_tokens <> 2 then
    raise exception 'ATOMIC_PAIR_ALLOWED_DID_NOT_CHARGE_BOTH';
  end if;
end;
$atomic_pair_both_allowed$;

do $atomic_pair_first_limited$
declare
  v_result jsonb;
  v_first_tokens double precision;
  v_second_tokens double precision;
begin
  insert into public.rate_limits (key, tokens, last_refill) values
    ('atomic-pair-test:first-limited:first', 0, pg_catalog.now() + interval '1 minute'),
    ('atomic-pair-test:first-limited:second', 5, pg_catalog.now() + interval '1 minute');
  v_result := public.rate_limit_consume_pair(
    'atomic-pair-test:first-limited:first', 1, 0.000001, 1,
    'atomic-pair-test:first-limited:second', 5, 0.000001, 1
  );
  if v_result <> '{"first_allowed":false,"second_allowed":true}'::jsonb then
    raise exception 'ATOMIC_PAIR_FIRST_LIMIT_RESULT_INVALID';
  end if;
  select tokens into v_first_tokens from public.rate_limits
  where key = 'atomic-pair-test:first-limited:first';
  select tokens into v_second_tokens from public.rate_limits
  where key = 'atomic-pair-test:first-limited:second';
  if v_first_tokens <> 0 or v_second_tokens <> 5 then
    raise exception 'ATOMIC_PAIR_FIRST_LIMIT_CHARGED_A_BUCKET';
  end if;
end;
$atomic_pair_first_limited$;

do $atomic_pair_second_limited$
declare
  v_result jsonb;
  v_first_tokens double precision;
  v_second_tokens double precision;
begin
  insert into public.rate_limits (key, tokens, last_refill) values
    ('atomic-pair-test:second-limited:first', 1, pg_catalog.now() + interval '1 minute'),
    ('atomic-pair-test:second-limited:second', 0, pg_catalog.now() + interval '1 minute');
  v_result := public.rate_limit_consume_pair(
    'atomic-pair-test:second-limited:first', 1, 0.000001, 1,
    'atomic-pair-test:second-limited:second', 5, 0.000001, 1
  );
  if v_result <> '{"first_allowed":true,"second_allowed":false}'::jsonb then
    raise exception 'ATOMIC_PAIR_SECOND_LIMIT_RESULT_INVALID';
  end if;
  select tokens into v_first_tokens from public.rate_limits
  where key = 'atomic-pair-test:second-limited:first';
  select tokens into v_second_tokens from public.rate_limits
  where key = 'atomic-pair-test:second-limited:second';
  if v_first_tokens <> 1 or v_second_tokens <> 0 then
    raise exception 'ATOMIC_PAIR_SECOND_LIMIT_CHARGED_A_BUCKET';
  end if;
end;
$atomic_pair_second_limited$;

do $atomic_pair_replay$
declare
  v_result jsonb;
  v_count bigint;
begin
  perform public.rate_limit_consume_pair(
    'atomic-pair-test:replay:first', 1, 0.000001, 1,
    'atomic-pair-test:replay:second', 1, 0.000001, 1
  );
  v_result := public.rate_limit_consume_pair(
    'atomic-pair-test:replay:second', 1, 0.000001, 1,
    'atomic-pair-test:replay:first', 1, 0.000001, 1
  );
  if v_result <> '{"first_allowed":false,"second_allowed":false}'::jsonb then
    raise exception 'ATOMIC_PAIR_REPLAY_NOT_LIMITED';
  end if;
  select count(*) into v_count from public.rate_limits
  where key in ('atomic-pair-test:replay:first', 'atomic-pair-test:replay:second')
    and tokens >= 0;
  if v_count <> 2 then raise exception 'ATOMIC_PAIR_REPLAY_CORRUPTED_BALANCE'; end if;
end;
$atomic_pair_replay$;

do $atomic_pair_validation_and_grants$
begin
  begin
    perform public.rate_limit_consume_pair('same', 1, 1, 1, 'same', 1, 1, 1);
    raise exception 'ATOMIC_PAIR_DUPLICATE_KEY_ACCEPTED';
  exception when invalid_parameter_value then
    if sqlerrm <> 'RATE_LIMIT_PAIR_INVALID_KEY' then raise; end if;
  end;
  begin
    perform public.rate_limit_consume_pair('', 1, 1, 1, 'valid', 1, 1, 1);
    raise exception 'ATOMIC_PAIR_EMPTY_KEY_ACCEPTED';
  exception when invalid_parameter_value then
    if sqlerrm <> 'RATE_LIMIT_PAIR_INVALID_KEY' then raise; end if;
  end;
  begin
    perform public.rate_limit_consume_pair(
      pg_catalog.repeat('x', 257), 1, 1, 1, 'valid', 1, 1, 1
    );
    raise exception 'ATOMIC_PAIR_OVERSIZED_KEY_ACCEPTED';
  exception when invalid_parameter_value then
    if sqlerrm <> 'RATE_LIMIT_PAIR_INVALID_KEY' then raise; end if;
  end;
  begin
    perform public.rate_limit_consume_pair('first', 0, 1, 1, 'second', 1, 1, 1);
    raise exception 'ATOMIC_PAIR_INVALID_NUMERIC_ACCEPTED';
  exception when invalid_parameter_value then
    if sqlerrm <> 'RATE_LIMIT_PAIR_INVALID_NUMERIC' then raise; end if;
  end;
  begin
    perform public.rate_limit_consume_pair('first', null, 1, 1, 'second', 1, 1, 1);
    raise exception 'ATOMIC_PAIR_NULL_NUMERIC_ACCEPTED';
  exception when invalid_parameter_value then
    if sqlerrm <> 'RATE_LIMIT_PAIR_INVALID_NUMERIC' then raise; end if;
  end;
  begin
    perform public.rate_limit_consume_pair(
      'first', 'NaN'::double precision, 1, 1, 'second', 1, 1, 1
    );
    raise exception 'ATOMIC_PAIR_NAN_ACCEPTED';
  exception when invalid_parameter_value then
    if sqlerrm <> 'RATE_LIMIT_PAIR_INVALID_NUMERIC' then raise; end if;
  end;
  begin
    perform public.rate_limit_consume_pair(
      'first', 'Infinity'::double precision, 1, 1, 'second', 1, 1, 1
    );
    raise exception 'ATOMIC_PAIR_POSITIVE_INFINITY_ACCEPTED';
  exception when invalid_parameter_value then
    if sqlerrm <> 'RATE_LIMIT_PAIR_INVALID_NUMERIC' then raise; end if;
  end;
  begin
    perform public.rate_limit_consume_pair(
      'first', '-Infinity'::double precision, 1, 1, 'second', 1, 1, 1
    );
    raise exception 'ATOMIC_PAIR_NEGATIVE_INFINITY_ACCEPTED';
  exception when invalid_parameter_value then
    if sqlerrm <> 'RATE_LIMIT_PAIR_INVALID_NUMERIC' then raise; end if;
  end;

  if not pg_catalog.has_function_privilege(
    'service_role',
    'public.rate_limit_consume_pair(text,double precision,double precision,double precision,text,double precision,double precision,double precision)',
    'EXECUTE'
  ) then raise exception 'ATOMIC_PAIR_SERVICE_ROLE_GRANT_MISSING'; end if;
  if pg_catalog.has_function_privilege(
    'anon',
    'public.rate_limit_consume_pair(text,double precision,double precision,double precision,text,double precision,double precision,double precision)',
    'EXECUTE'
  ) or pg_catalog.has_function_privilege(
    'authenticated',
    'public.rate_limit_consume_pair(text,double precision,double precision,double precision,text,double precision,double precision,double precision)',
    'EXECUTE'
  ) then raise exception 'ATOMIC_PAIR_UNPRIVILEGED_EXECUTE_PRESENT'; end if;
end;
$atomic_pair_validation_and_grants$;

rollback;
