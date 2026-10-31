\set ON_ERROR_STOP on
set statement_timeout = '15s';

begin;
delete from public.rate_limits
where key in ('atomic-pair-concurrency:a', 'atomic-pair-concurrency:b');
insert into public.rate_limits (key, tokens, last_refill) values
  ('atomic-pair-concurrency:a', 2, pg_catalog.now() + interval '1 hour'),
  ('atomic-pair-concurrency:b', 2, pg_catalog.now() + interval '1 hour');
commit;
