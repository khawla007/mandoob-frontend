-- P3.09 bank-transfer evidence adapter over the frozen P3.07 document lifecycle.
-- Finalized document objects are retained by P3.07; this migration never deletes them.
begin;

insert into public.event_contract_registrations (event_type, event_version, payload_schema)
values
  ('finance.bank_evidence.submitted', 1, '{"resource_id":"uuid","invoice_id":"uuid","operation_id":"uuid","document_id":"uuid","version_id":"uuid","version":"integer","state":"state"}'),
  ('finance.bank_evidence.reviewed', 1, '{"resource_id":"uuid","invoice_id":"uuid","operation_id":"uuid","version":"integer","state":"state"}')
on conflict (event_type, event_version) do nothing;

insert into public.event_consumer_registrations
  (consumer_name, event_type, event_version, max_attempts, default_lease_seconds, enabled)
select 'internal.finance.projection', event_type, event_version, 5, 120, true
from public.event_contract_registrations
where event_type in ('finance.bank_evidence.submitted','finance.bank_evidence.reviewed')
on conflict (consumer_name, event_type, event_version) do nothing;

create table public.bank_evidence_retention_policies (
  policy_key text primary key check (policy_key ~ '^[a-z][a-z0-9._-]{0,63}$'),
  reviewed_at timestamptz not null,
  reviewed_by uuid not null references public.profiles(id) on delete restrict,
  active boolean not null default true
);

create table public.bank_transfer_submissions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  company_id uuid not null,
  customer_profile_id uuid not null,
  invoice_id uuid not null,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  operation_id uuid not null,
  document_id uuid,
  version_id uuid,
  version bigint not null default 0 check (version >= 0),
  review_state text not null default 'pending' check (
    review_state in ('pending','clean','rejected','reconciled','expired','held','tombstoned')
  ),
  policy_key text references public.bank_evidence_retention_policies(policy_key) on delete restrict,
  expires_at timestamptz,
  legal_hold boolean not null default false,
  investigation_hold boolean not null default false,
  reviewed_by uuid references public.profiles(id) on delete restrict,
  reviewed_at timestamptz,
  review_note text,
  tombstoned_at timestamptz,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  finalized_at timestamptz,
  unique (actor_id, operation_id),
  unique (tenant_id, company_id, id),
  constraint bank_transfer_submissions_company_fk foreign key (tenant_id, company_id)
    references public.company_profiles(tenant_id, id) on delete restrict,
  constraint bank_transfer_submissions_customer_fk foreign key (company_id, customer_profile_id)
    references public.customer_profiles(linked_company_id, profile_id) on delete restrict,
  constraint bank_transfer_submissions_invoice_fk foreign key (tenant_id, company_id, invoice_id)
    references public.invoices(tenant_id, company_id, id) on delete restrict,
  constraint bank_transfer_submissions_document_fk foreign key (tenant_id, company_id, document_id)
    references public.documents(tenant_id, company_id, id) on delete restrict,
  constraint bank_transfer_submissions_version_fk foreign key (tenant_id, document_id, version_id)
    references public.document_versions(tenant_id, document_id, id) on delete restrict,
  constraint bank_transfer_submissions_binding_shape check (
    (document_id is null and version_id is null and finalized_at is null)
    or (document_id is not null and version_id is not null and finalized_at is not null)
  ),
  constraint bank_transfer_submissions_retention_shape check (
    (policy_key is null and expires_at is null) or (policy_key is not null and expires_at is not null)
  ),
  constraint bank_transfer_submissions_review_shape check (
    (review_state = 'pending' and reviewed_by is null and reviewed_at is null)
    or (review_state <> 'pending' and reviewed_by is not null and reviewed_at is not null)
  ),
  constraint bank_transfer_submissions_tombstone_shape check (
    (review_state = 'tombstoned' and tombstoned_at is not null)
    or (review_state <> 'tombstoned' and tombstoned_at is null)
  )
);

create table public.bank_evidence_operation_receipts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  company_id uuid not null,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  operation_id uuid not null,
  submission_id uuid not null,
  expected_version bigint not null check (expected_version >= 0),
  committed_version bigint not null check (committed_version > expected_version),
  payload_hash text not null check (payload_hash ~ '^[a-f0-9]{64}$'),
  sanitized_result jsonb not null,
  committed_at timestamptz not null default pg_catalog.clock_timestamp(),
  unique (actor_id, operation_id),
  constraint bank_evidence_receipt_submission_fk foreign key (tenant_id, company_id, submission_id)
    references public.bank_transfer_submissions(tenant_id, company_id, id) on delete restrict
);

create index bank_transfer_submissions_company_queue_idx
  on public.bank_transfer_submissions(tenant_id, company_id, review_state, created_at desc, id desc);
create index bank_transfer_submissions_invoice_idx
  on public.bank_transfer_submissions(tenant_id, company_id, invoice_id, created_at desc);

alter table public.bank_evidence_retention_policies enable row level security;
alter table public.bank_transfer_submissions enable row level security;
alter table public.bank_evidence_operation_receipts enable row level security;
revoke all on table public.bank_evidence_retention_policies from public, anon, authenticated;
revoke all on table public.bank_transfer_submissions from public, anon, authenticated;
revoke all on table public.bank_evidence_operation_receipts from public, anon, authenticated;
grant select, insert, update on table public.bank_evidence_retention_policies to service_role;
grant select, insert, update on table public.bank_transfer_submissions to service_role;
grant select, insert on table public.bank_evidence_operation_receipts to service_role;

create function private.p309_assert_customer_bank_evidence_scope(
  p_actor_id uuid, p_tenant_id uuid, p_company_id uuid, p_customer_profile_id uuid
) returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_actor_id is distinct from p_customer_profile_id or not exists (
    select 1 from public.profiles profile
    join public.tenants tenant on tenant.id=p_tenant_id and tenant.status='active'
    join public.customer_profiles customer on customer.profile_id=profile.id
      and customer.linked_company_id=p_company_id
    join public.company_profiles company on company.id=p_company_id and company.tenant_id=p_tenant_id
    where profile.id=p_actor_id and profile.tenant_id=p_tenant_id
      and profile.role='customer' and profile.status='active'
  ) then raise exception using errcode='P3094',message='FORBIDDEN'; end if;
end;
$$;

create function private.p309_assert_bank_evidence_reviewer(
  p_actor_id uuid, p_tenant_id uuid, p_company_id uuid
) returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.profiles profile
    join public.tenants tenant on tenant.id=p_tenant_id and tenant.status='active'
    join public.company_profiles company on company.id=p_company_id and company.tenant_id=p_tenant_id
    where profile.id=p_actor_id and profile.status='active' and (
      profile.role in ('admin','super_admin') or (
        profile.role='pro' and profile.tenant_id=p_tenant_id and exists (
          select 1 from public.pro_company_assignments assignment
          where assignment.tenant_id=p_tenant_id and assignment.company_id=p_company_id
            and assignment.pro_profile_id=p_actor_id and assignment.status='active'
        )
      )
    )
  ) then raise exception using errcode='P3094',message='FORBIDDEN'; end if;
end;
$$;

create function private.p309_bank_evidence_result(
  p_submission public.bank_transfer_submissions, p_replayed boolean
) returns jsonb language sql stable security definer set search_path = '' as $$
  select pg_catalog.jsonb_build_object(
    'status',p_submission.review_state,'operationId',p_submission.operation_id,
    'submissionId',p_submission.id,'documentId',p_submission.document_id,
    'versionId',p_submission.version_id,'replayed',p_replayed
  );
$$;

create function public.p309_prepare_bank_evidence(
  p_actor_id uuid, p_tenant_id uuid, p_company_id uuid, p_customer_profile_id uuid,
  p_invoice_id uuid, p_operation_id uuid, p_policy_key text, p_expires_at timestamptz
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_existing public.bank_transfer_submissions%rowtype;
  v_invoice public.invoices%rowtype; v_id uuid:=gen_random_uuid(); v_allocated bigint;
begin
  perform private.p309_assert_customer_bank_evidence_scope(
    p_actor_id,p_tenant_id,p_company_id,p_customer_profile_id
  );
  if p_operation_id is null or (p_policy_key is null) <> (p_expires_at is null)
    or (p_policy_key is not null and not exists (
      select 1 from public.bank_evidence_retention_policies policy
      where policy.policy_key=p_policy_key and policy.active=true and policy.reviewed_at is not null
    )) then raise exception using errcode='22023',message='VALIDATION_FAILED'; end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_actor_id::text||':'||p_operation_id::text,0)
  );
  select submission.* into v_existing from public.bank_transfer_submissions submission
    where submission.actor_id=p_actor_id and submission.operation_id=p_operation_id for update;
  if found then
    if v_existing.tenant_id is distinct from p_tenant_id
      or v_existing.company_id is distinct from p_company_id
      or v_existing.customer_profile_id is distinct from p_customer_profile_id
      or v_existing.invoice_id is distinct from p_invoice_id
      or v_existing.policy_key is distinct from p_policy_key
      or v_existing.expires_at is distinct from p_expires_at
    then raise exception using errcode='P3099',message='OPERATION_REUSED'; end if;
    if v_existing.document_id is not null then
      return private.p309_bank_evidence_result(v_existing,true);
    end if;
    return pg_catalog.jsonb_build_object('status','prepared','operationId',p_operation_id,'submissionId',v_existing.id);
  end if;

  select invoice.* into v_invoice from public.invoices invoice
    where invoice.id=p_invoice_id and invoice.tenant_id=p_tenant_id
      and invoice.company_id=p_company_id and invoice.customer_profile_id=p_customer_profile_id
    for update;
  if not found then raise exception using errcode='P3094',message='FORBIDDEN'; end if;
  select coalesce(sum(allocation.amount_minor),0) into v_allocated
    from public.payment_allocations allocation where allocation.tenant_id=p_tenant_id
      and allocation.company_id=p_company_id and allocation.invoice_id=p_invoice_id;
  if v_invoice.status<>'open' or v_invoice.amount_minor-v_allocated<=0 then
    raise exception using errcode='P3099',message='INVOICE_NOT_OPEN';
  end if;
  insert into public.bank_transfer_submissions(
    id,tenant_id,company_id,customer_profile_id,invoice_id,actor_id,operation_id,policy_key,expires_at
  ) values(v_id,p_tenant_id,p_company_id,p_customer_profile_id,p_invoice_id,p_actor_id,p_operation_id,p_policy_key,p_expires_at);
  return pg_catalog.jsonb_build_object('status','prepared','operationId',p_operation_id,'submissionId',v_id);
end;
$$;

create function public.p309_finalize_bank_evidence(
  p_actor_id uuid, p_tenant_id uuid, p_company_id uuid, p_customer_profile_id uuid,
  p_invoice_id uuid, p_operation_id uuid, p_submission_id uuid,
  p_document_id uuid, p_version_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_submission public.bank_transfer_submissions%rowtype;
  v_invoice public.invoices%rowtype; v_allocated bigint;
begin
  perform private.p309_assert_customer_bank_evidence_scope(
    p_actor_id,p_tenant_id,p_company_id,p_customer_profile_id
  );
  select submission.* into v_submission from public.bank_transfer_submissions submission
    where submission.id=p_submission_id and submission.tenant_id=p_tenant_id
      and submission.company_id=p_company_id for update;
  if not found or v_submission.actor_id is distinct from p_actor_id
    or v_submission.customer_profile_id is distinct from p_customer_profile_id
    or v_submission.invoice_id is distinct from p_invoice_id
    or v_submission.operation_id is distinct from p_operation_id
  then raise exception using errcode='P3094',message='FORBIDDEN'; end if;
  if v_submission.document_id is not null then
    if v_submission.document_id is distinct from p_document_id
      or v_submission.version_id is distinct from p_version_id
    then raise exception using errcode='P3099',message='OPERATION_REUSED'; end if;
    return private.p309_bank_evidence_result(v_submission,true);
  end if;
  if v_submission.review_state is distinct from 'pending'
    or v_submission.reviewed_by is not null or v_submission.reviewed_at is not null
  then raise exception using errcode='P3099',message='CONFLICT'; end if;

  select invoice.* into v_invoice from public.invoices invoice
    where invoice.id=p_invoice_id and invoice.tenant_id=p_tenant_id
      and invoice.company_id=p_company_id and invoice.customer_profile_id=p_customer_profile_id
    for update;
  if not found then raise exception using errcode='P3094',message='FORBIDDEN'; end if;
  select coalesce(sum(allocation.amount_minor),0) into v_allocated
    from public.payment_allocations allocation where allocation.tenant_id=p_tenant_id
      and allocation.company_id=p_company_id and allocation.invoice_id=p_invoice_id;
  if v_invoice.status<>'open' or v_invoice.amount_minor-v_allocated<=0 then
    raise exception using errcode='P3099',message='INVOICE_NOT_OPEN'; end if;
  if not exists (
    select 1 from public.documents document join public.document_versions version
      on version.tenant_id=document.tenant_id and version.document_id=document.id
    where document.id=p_document_id and document.tenant_id=p_tenant_id
      and document.company_id=p_company_id and document.current_version_id=p_version_id
      and document.doc_type='other' and document.label='Bank transfer evidence'
      and version.id=p_version_id and version.upload_operation_id=p_operation_id
  ) then raise exception using errcode='P3094',message='FORBIDDEN'; end if;
  update public.bank_transfer_submissions submission set
    document_id=p_document_id,version_id=p_version_id,finalized_at=pg_catalog.clock_timestamp(),version=version+1
    where submission.id=p_submission_id returning submission.* into v_submission;
  perform private.p309_publish_event(
    'finance.bank_evidence.submitted',p_tenant_id,p_company_id,p_actor_id,p_operation_id,
    pg_catalog.jsonb_build_object(
      'resource_id',v_submission.id,'invoice_id',v_submission.invoice_id,
      'operation_id',p_operation_id,'document_id',v_submission.document_id,
      'version_id',v_submission.version_id,'version',v_submission.version,'state','pending'
    )
  );
  return private.p309_bank_evidence_result(v_submission,false);
end;
$$;

create function public.p309_review_bank_evidence(
  p_actor_id uuid, p_tenant_id uuid, p_company_id uuid, p_submission_id uuid,
  p_operation_id uuid, p_expected_version bigint, p_expected_state text,
  p_payload_hash text, p_decision text, p_note text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_submission public.bank_transfer_submissions%rowtype;
  v_receipt public.bank_evidence_operation_receipts%rowtype;
  v_now timestamptz:=pg_catalog.clock_timestamp(); v_result jsonb;
begin
  perform private.p309_assert_bank_evidence_reviewer(p_actor_id,p_tenant_id,p_company_id);
  if p_operation_id is null or p_expected_version < 0
    or p_payload_hash !~ '^[a-f0-9]{64}$'
    or p_expected_state not in ('pending','clean','held')
    or p_decision not in ('clean','rejected','held','expire','tombstone')
    or pg_catalog.char_length(coalesce(pg_catalog.btrim(p_note),''))>280
    or (p_decision='rejected' and pg_catalog.char_length(coalesce(pg_catalog.btrim(p_note),''))<3)
  then raise exception using errcode='22023',message='VALIDATION_FAILED'; end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_actor_id::text||':'||p_operation_id::text,0)
  );
  select receipt.* into v_receipt from public.bank_evidence_operation_receipts receipt
    where receipt.actor_id=p_actor_id and receipt.operation_id=p_operation_id for update;
  if found then
    if v_receipt.tenant_id is distinct from p_tenant_id
      or v_receipt.company_id is distinct from p_company_id
      or v_receipt.submission_id is distinct from p_submission_id
      or v_receipt.expected_version is distinct from p_expected_version
      or v_receipt.payload_hash is distinct from p_payload_hash
    then raise exception using errcode='P3099',message='OPERATION_REUSED'; end if;
    return v_receipt.sanitized_result||'{"replayed":true}'::jsonb;
  end if;
  select submission.* into v_submission from public.bank_transfer_submissions submission
    where submission.id=p_submission_id and submission.tenant_id=p_tenant_id
      and submission.company_id=p_company_id for update;
  if not found then raise exception using errcode='P3094',message='FORBIDDEN'; end if;
  perform 1 from public.invoices invoice where invoice.id=v_submission.invoice_id
    and invoice.tenant_id=p_tenant_id and invoice.company_id=p_company_id for update;
  if v_submission.document_id is null or v_submission.version_id is null
    or v_submission.finalized_at is null
  then raise exception using errcode='P3099',message='CONFLICT'; end if;
  if v_submission.version is distinct from p_expected_version
    or v_submission.review_state is distinct from p_expected_state then
    raise exception using errcode='P3099',message='CONFLICT'; end if;
  if p_decision in ('expire','tombstone') and (
    v_submission.legal_hold is true or v_submission.investigation_hold is true
  ) then raise exception using errcode='P3099',message='HOLD_ACTIVE'; end if;
  if p_decision='expire' and (v_submission.expires_at is null or v_submission.expires_at>v_now)
  then raise exception using errcode='P3099',message='NOT_EXPIRED'; end if;
  update public.bank_transfer_submissions submission set
    review_state=case p_decision when 'expire' then 'expired' when 'tombstone' then 'tombstoned' else p_decision end,
    reviewed_by=p_actor_id,reviewed_at=v_now,review_note=nullif(pg_catalog.btrim(p_note),''),
    tombstoned_at=case when p_decision='tombstone' then v_now else null end,version=version+1
    where submission.id=p_submission_id returning submission.* into v_submission;
  v_result:=pg_catalog.jsonb_build_object(
    'status',v_submission.review_state,'version',v_submission.version,'replayed',false
  );
  insert into public.bank_evidence_operation_receipts(
    tenant_id,company_id,actor_id,operation_id,submission_id,expected_version,
    committed_version,payload_hash,sanitized_result
  ) values (
    p_tenant_id,p_company_id,p_actor_id,p_operation_id,p_submission_id,p_expected_version,
    v_submission.version,p_payload_hash,v_result
  );
  perform private.p309_publish_event(
    'finance.bank_evidence.reviewed',p_tenant_id,p_company_id,p_actor_id,p_operation_id,
    pg_catalog.jsonb_build_object(
      'resource_id',v_submission.id,'invoice_id',v_submission.invoice_id,
      'operation_id',p_operation_id,'version',v_submission.version,'state',v_submission.review_state
    )
  );
  return v_result;
end;
$$;

create function public.p309_resolve_bank_evidence_access(
  p_actor_id uuid, p_tenant_id uuid, p_company_id uuid, p_submission_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_submission public.bank_transfer_submissions%rowtype;
begin
  perform private.p309_assert_bank_evidence_reviewer(p_actor_id,p_tenant_id,p_company_id);
  select submission.* into v_submission from public.bank_transfer_submissions submission
    where submission.id=p_submission_id and submission.tenant_id=p_tenant_id
      and submission.company_id=p_company_id for share;
  if not found or v_submission.review_state not in ('pending','clean')
    or v_submission.document_id is null or v_submission.version_id is null
    or v_submission.finalized_at is null
    or v_submission.tombstoned_at is not null
    or (v_submission.expires_at is not null and v_submission.expires_at<=pg_catalog.clock_timestamp())
  then raise exception using errcode='P3094',message='FORBIDDEN'; end if;
  return pg_catalog.jsonb_build_object('status','allowed','documentId',v_submission.document_id,'versionId',v_submission.version_id);
end;
$$;

-- Manual allocation is evidence-backed only when the immutable binding is reviewed-clean.
create function public.p309_allocate_reviewed_bank_payment(
  p_tenant_id uuid,p_company_id uuid,p_actor_id uuid,p_operation_id uuid,
  p_expected_version bigint,p_payload_hash text,p_invoice_id uuid,p_submission_id uuid,
  p_amount_minor bigint,p_note text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_submission public.bank_transfer_submissions%rowtype; v_result jsonb;
  v_replay jsonb; v_receipt_id uuid;
begin
  perform private.p309_assert_pro_finance_scope(p_actor_id,p_tenant_id,p_company_id);
  -- The finance receipt is authoritative for an ambiguous retry. It must be read
  -- before the evidence state gate because first success changes clean to reconciled.
  v_replay:=private.p309_command_replay(
    p_actor_id,p_tenant_id,p_company_id,p_operation_id,p_payload_hash
  );
  if v_replay is not null then return v_replay||'{"replayed":true}'::jsonb; end if;
  select submission.* into v_submission from public.bank_transfer_submissions submission
    where submission.id=p_submission_id and submission.tenant_id=p_tenant_id
      and submission.company_id=p_company_id and submission.invoice_id=p_invoice_id for update;
  if not found then raise exception using errcode='P3094',message='FORBIDDEN'; end if;
  perform 1 from public.invoices invoice where invoice.id=p_invoice_id
    and invoice.tenant_id=p_tenant_id and invoice.company_id=p_company_id for update;
  if not found or v_submission.review_state<>'clean' or v_submission.document_id is null
    or v_submission.tombstoned_at is not null
    or (v_submission.expires_at is not null and v_submission.expires_at<=pg_catalog.clock_timestamp())
  then raise exception using errcode='P3094',message='FORBIDDEN'; end if;
  v_result:=public.p309_allocate_manual_payment(
    p_tenant_id,p_company_id,p_actor_id,p_operation_id,p_expected_version,p_payload_hash,
    p_invoice_id,p_amount_minor,'bank_transfer',p_note
  );
  update public.bank_transfer_submissions set
    review_state='reconciled',reviewed_at=pg_catalog.clock_timestamp(),version=version+1
    where id=p_submission_id and review_state='clean';
  select receipt.id into strict v_receipt_id from public.finance_operation_receipts receipt
    where receipt.actor_id=p_actor_id and receipt.operation_id=p_operation_id;
  -- Reconciliation has no frozen bank-evidence event contract. The existing payment
  -- allocation event remains authoritative; this reference-only audit records binding.
  perform private.p309_command_audit(
    p_tenant_id,p_company_id,p_actor_id,v_receipt_id,'finance.bank_evidence_reconciled',
    'bank_evidence',p_submission_id,
    pg_catalog.jsonb_build_object('invoice_id',p_invoice_id,'evidence_version',v_submission.version+1)
  );
  return v_result;
end;
$$;

revoke all on function private.p309_assert_customer_bank_evidence_scope(uuid,uuid,uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function private.p309_assert_bank_evidence_reviewer(uuid,uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function private.p309_bank_evidence_result(public.bank_transfer_submissions,boolean) from public,anon,authenticated,service_role;
revoke all on function public.p309_prepare_bank_evidence(uuid,uuid,uuid,uuid,uuid,uuid,text,timestamptz) from public,anon,authenticated;
revoke all on function public.p309_finalize_bank_evidence(uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function public.p309_review_bank_evidence(uuid,uuid,uuid,uuid,uuid,bigint,text,text,text,text) from public,anon,authenticated;
revoke all on function public.p309_resolve_bank_evidence_access(uuid,uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function public.p309_allocate_reviewed_bank_payment(uuid,uuid,uuid,uuid,bigint,text,uuid,uuid,bigint,text) from public,anon,authenticated;
grant execute on function public.p309_prepare_bank_evidence(uuid,uuid,uuid,uuid,uuid,uuid,text,timestamptz) to service_role;
grant execute on function public.p309_finalize_bank_evidence(uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid) to service_role;
grant execute on function public.p309_review_bank_evidence(uuid,uuid,uuid,uuid,uuid,bigint,text,text,text,text) to service_role;
grant execute on function public.p309_resolve_bank_evidence_access(uuid,uuid,uuid,uuid) to service_role;
grant execute on function public.p309_allocate_reviewed_bank_payment(uuid,uuid,uuid,uuid,bigint,text,uuid,uuid,bigint,text) to service_role;

commit;
