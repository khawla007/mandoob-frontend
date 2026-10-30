\set ON_ERROR_STOP on

begin;
insert into public.tenants (id, slug, name, status)
values (
  '91900000-0000-4000-8000-000000000001',
  'inbound-concurrency-test',
  'Inbound Concurrency Test',
  'active'
);
commit;
