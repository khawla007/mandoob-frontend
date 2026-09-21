\set ON_ERROR_STOP on
begin;
create schema if not exists document_review_expiry_contract;
create or replace function document_review_expiry_contract.uid(n integer)
returns uuid language sql immutable as $$
  select ('99030772-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid;
$$;
insert into public.tenants(id,slug,name) values
  (document_review_expiry_contract.uid(100),'review-expiry-race','Review expiry race');
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select document_review_expiry_contract.uid(n),'00000000-0000-0000-0000-000000000000',
  'authenticated','authenticated','review-expiry-race-'||n||'@example.invalid','',now(),
  '{}'::jsonb,'{}'::jsonb,now(),now() from unnest(array[1,3]) n;
insert into public.profiles(id,tenant_id,role,status) values
  (document_review_expiry_contract.uid(1),null,'pro','active'),
  (document_review_expiry_contract.uid(3),null,'admin','active');
insert into public.pro_profiles(profile_id) values
  (document_review_expiry_contract.uid(1));
insert into public.company_profiles(id,tenant_id,company_name) values
  (document_review_expiry_contract.uid(101),document_review_expiry_contract.uid(100),'Race company');
insert into public.pro_company_assignments(id,tenant_id,company_id,pro_profile_id,assigned_by)
values
  (document_review_expiry_contract.uid(11),document_review_expiry_contract.uid(100),document_review_expiry_contract.uid(101),document_review_expiry_contract.uid(1),document_review_expiry_contract.uid(3));
insert into public.documents(id,tenant_id,company_id,doc_type,label) values
  (document_review_expiry_contract.uid(200),document_review_expiry_contract.uid(100),document_review_expiry_contract.uid(101),'passport','Review race'),
  (document_review_expiry_contract.uid(201),document_review_expiry_contract.uid(100),document_review_expiry_contract.uid(101),'passport','Expiry race'),
  (document_review_expiry_contract.uid(202),document_review_expiry_contract.uid(100),document_review_expiry_contract.uid(101),'passport','Head race');
insert into public.document_versions(id,document_id,tenant_id,storage_path,mime_type,size_bytes,sha256,uploaded_by) values
  (document_review_expiry_contract.uid(300),document_review_expiry_contract.uid(200),document_review_expiry_contract.uid(100),'race/review.pdf','application/pdf',4,repeat('a',64),document_review_expiry_contract.uid(1)),
  (document_review_expiry_contract.uid(301),document_review_expiry_contract.uid(201),document_review_expiry_contract.uid(100),'race/expiry.pdf','application/pdf',4,repeat('b',64),document_review_expiry_contract.uid(1)),
  (document_review_expiry_contract.uid(302),document_review_expiry_contract.uid(202),document_review_expiry_contract.uid(100),'race/head-old.pdf','application/pdf',4,repeat('c',64),document_review_expiry_contract.uid(1)),
  (document_review_expiry_contract.uid(303),document_review_expiry_contract.uid(202),document_review_expiry_contract.uid(100),'race/head-new.pdf','application/pdf',4,repeat('d',64),document_review_expiry_contract.uid(1));
update public.documents set current_version_id=case id
  when document_review_expiry_contract.uid(200) then document_review_expiry_contract.uid(300)
  when document_review_expiry_contract.uid(201) then document_review_expiry_contract.uid(301)
  else document_review_expiry_contract.uid(302) end
where tenant_id=document_review_expiry_contract.uid(100);
commit;
