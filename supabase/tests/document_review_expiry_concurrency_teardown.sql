\set ON_ERROR_STOP on
begin;
delete from public.tenants where id='99030772-0000-4000-8000-000000000100';
delete from auth.users where id in (
  '99030772-0000-4000-8000-000000000001',
  '99030772-0000-4000-8000-000000000003'
);
drop schema if exists document_review_expiry_contract cascade;
commit;
