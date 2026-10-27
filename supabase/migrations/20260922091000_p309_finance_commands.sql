-- P3.09 invoice, allocation, and refund commands. All financial mutations are
-- service-role-only, replay-safe, versioned, and scoped to a live PRO assignment.
begin;

create table public.finance_receipt_snapshots (
  operation_receipt_id uuid primary key,
  tenant_id uuid not null,
  company_id uuid not null,
  receipt_kind text not null check (receipt_kind in ('invoice','payment','refund')),
  receipt_id uuid not null,
  invoice_id uuid not null,
  snapshot jsonb not null check (pg_catalog.jsonb_typeof(snapshot)='object'),
  captured_at timestamptz not null default pg_catalog.clock_timestamp(),
  unique (tenant_id,company_id,receipt_kind,receipt_id),
  foreign key (tenant_id,company_id,operation_receipt_id)
    references public.finance_operation_receipts(tenant_id,company_id,id) on delete restrict,
  foreign key (tenant_id,company_id,invoice_id)
    references public.invoices(tenant_id,company_id,id) on delete restrict
);
create trigger finance_receipt_snapshots_immutable
  before update or delete on public.finance_receipt_snapshots
  for each row execute function private.p309_reject_mutation();
alter table public.finance_receipt_snapshots enable row level security;
revoke all on table public.finance_receipt_snapshots from public,anon,authenticated,service_role;

insert into public.event_contract_registrations (event_type, event_version, payload_schema)
values
  ('finance.invoice.created', 1, '{"resource_id":"uuid","operation_id":"uuid","version":"integer","state":"state","amount_minor":"integer","currency":"reference"}'),
  ('finance.invoice.finalized', 1, '{"resource_id":"uuid","operation_id":"uuid","version":"integer","state":"state","amount_minor":"integer","currency":"reference"}'),
  ('finance.invoice.voided', 1, '{"resource_id":"uuid","operation_id":"uuid","version":"integer","state":"state","amount_minor":"integer","currency":"reference"}'),
  ('finance.payment.allocated', 1, '{"resource_id":"uuid","invoice_id":"uuid","operation_id":"uuid","version":"integer","state":"state","amount_minor":"integer","currency":"reference"}'),
  ('finance.refund.prepared', 1, '{"resource_id":"uuid","invoice_id":"uuid","payment_id":"uuid","operation_id":"uuid","version":"integer","state":"state","amount_minor":"integer","currency":"reference"}'),
  ('finance.refund.reconciled', 1, '{"resource_id":"uuid","invoice_id":"uuid","payment_id":"uuid","operation_id":"uuid","version":"integer","state":"state","amount_minor":"integer","currency":"reference"}'),
  ('finance.expense.posted', 1, '{"resource_id":"uuid","operation_id":"uuid","version":"integer","state":"state","amount_minor":"integer","currency":"reference"}'),
  ('finance.compensation.posted', 1, '{"resource_id":"uuid","operation_id":"uuid","version":"integer","state":"state","amount_minor":"integer","currency":"reference"}')
on conflict (event_type, event_version) do nothing;

insert into public.event_consumer_registrations
  (consumer_name, event_type, event_version, max_attempts, default_lease_seconds, enabled)
select 'internal.finance.projection', event_type, event_version, 5, 120, true
from public.event_contract_registrations where event_type like 'finance.%'
on conflict (consumer_name, event_type, event_version) do nothing;

create function private.p309_assert_pro_finance_scope(
  p_actor_id uuid, p_tenant_id uuid, p_company_id uuid
) returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.profiles profile
    join public.tenants tenant on tenant.id = p_tenant_id and tenant.status = 'active'
    join public.company_profiles company
      on company.id = p_company_id and company.tenant_id = p_tenant_id
    join public.pro_company_assignments assignment
      on assignment.tenant_id = p_tenant_id and assignment.company_id = p_company_id
      and assignment.pro_profile_id = p_actor_id and assignment.status = 'active'
    where profile.id = p_actor_id and profile.role = 'pro' and profile.status = 'active'
      and profile.tenant_id = p_tenant_id
  ) then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;
end;
$$;

create function private.p309_command_replay(
  p_actor_id uuid, p_tenant_id uuid, p_company_id uuid,
  p_operation_id uuid, p_payload_hash text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_result jsonb;
begin
  -- Serialize every operation key before inspecting its receipt. A concurrent exact
  -- replay therefore waits for the first transaction and returns its committed result.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_actor_id::text || ':' || p_operation_id::text, 0)
  );
  v_result := private.p309_replay_receipt(p_actor_id, p_operation_id, p_payload_hash);
  if v_result is not null and not exists (
    select 1 from public.finance_operation_receipts receipt
    where receipt.actor_id = p_actor_id and receipt.operation_id = p_operation_id
      and receipt.tenant_id = p_tenant_id and receipt.company_id = p_company_id
  ) then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;
  return v_result;
end;
$$;

create function private.p309_command_receipt(
  p_tenant_id uuid, p_company_id uuid, p_actor_id uuid, p_operation_id uuid,
  p_kind text, p_aggregate_id uuid, p_expected_version bigint,
  p_committed_version bigint, p_payload_hash text, p_result jsonb
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  insert into public.finance_operation_receipts (
    tenant_id, company_id, actor_id, operation_id, aggregate_kind, aggregate_id,
    expected_version, committed_version, payload_hash, sanitized_result
  ) values (
    p_tenant_id, p_company_id, p_actor_id, p_operation_id, p_kind, p_aggregate_id,
    p_expected_version, p_committed_version, p_payload_hash, p_result
  ) returning id into v_id;
  return v_id;
end;
$$;

create function private.p309_command_audit(
  p_tenant_id uuid, p_company_id uuid, p_actor_id uuid, p_receipt_id uuid,
  p_action text, p_kind text, p_resource_id uuid, p_details jsonb
) returns void language sql security definer set search_path = '' as $$
  insert into public.finance_audit_log
    (tenant_id, company_id, actor_id, operation_receipt_id, action, resource_kind, resource_id, details)
  values
    (p_tenant_id, p_company_id, p_actor_id, p_receipt_id, p_action, p_kind, p_resource_id, p_details);
$$;

create function private.p309_capture_receipt_snapshot(
  p_operation_receipt_id uuid,p_receipt_kind text,p_receipt_id uuid,p_invoice_id uuid,
  p_journal_id uuid,p_status text,p_payment_method text default null
) returns void language plpgsql security definer set search_path = '' as $$
declare
  v_invoice public.invoices%rowtype;v_tenant public.tenants%rowtype;v_company public.company_profiles%rowtype;
  v_occurred timestamptz;v_subtotal bigint;v_discount bigint;v_vat bigint;v_paid bigint;v_refunded bigint;
  v_lines jsonb;v_refunds jsonb;v_snapshot jsonb;
begin
  if p_receipt_kind not in ('invoice','payment','refund') then
    raise exception using errcode='22023',message='VALIDATION_FAILED';
  end if;
  select invoice.* into strict v_invoice from public.invoices invoice
  where invoice.id=p_invoice_id;
  select tenant.* into strict v_tenant from public.tenants tenant where tenant.id=v_invoice.tenant_id;
  select company.* into strict v_company from public.company_profiles company
  where company.id=v_invoice.company_id and company.tenant_id=v_invoice.tenant_id;
  select journal.accounting_at into strict v_occurred from public.finance_journals journal
  where journal.id=p_journal_id and journal.operation_receipt_id=p_operation_receipt_id
    and journal.tenant_id=v_invoice.tenant_id and journal.company_id=v_invoice.company_id
    and journal.state='posted';
  if not exists(select 1 from public.finance_operation_receipts receipt
    where receipt.id=p_operation_receipt_id and receipt.tenant_id=v_invoice.tenant_id
      and receipt.company_id=v_invoice.company_id and receipt.aggregate_kind=p_receipt_kind
      and receipt.aggregate_id=p_receipt_id)
  then raise exception using errcode='23503',message='RECEIPT_PROVENANCE_INVALID'; end if;

  select coalesce(pg_catalog.sum(line.quantity*line.unit_amount_minor),0)::bigint,
    coalesce(pg_catalog.sum(line.discount_minor),0)::bigint,
    coalesce(pg_catalog.sum(line.vat_minor),0)::bigint,
    coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('description',line.description,
      'netMinor',line.net_minor,'vatMinor',line.vat_minor,'totalMinor',line.total_minor)
      order by line.line_number),'[]'::jsonb)
  into v_subtotal,v_discount,v_vat,v_lines from public.invoice_lines line
  where line.tenant_id=v_invoice.tenant_id and line.company_id=v_invoice.company_id
    and line.invoice_id=p_invoice_id;
  select coalesce(pg_catalog.sum(allocation.amount_minor),0)::bigint into v_paid
  from public.payment_allocations allocation
  where allocation.tenant_id=v_invoice.tenant_id and allocation.company_id=v_invoice.company_id
    and allocation.invoice_id=p_invoice_id
    and (p_receipt_kind<>'payment' or allocation.payment_id=p_receipt_id);
  select coalesce(pg_catalog.sum(allocation.amount_minor),0)::bigint,
    coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id',refund.id,
      'amountMinor',refund.amount_minor,'status',refund.status,'reason',refund.reason)
      order by refund.created_at,refund.id),'[]'::jsonb)
  into v_refunded,v_refunds from public.refund_allocations allocation
  join public.refunds refund on refund.id=allocation.refund_id and refund.tenant_id=allocation.tenant_id
  where allocation.tenant_id=v_invoice.tenant_id and allocation.company_id=v_invoice.company_id
    and allocation.invoice_id=p_invoice_id and refund.status='succeeded'
    and (p_receipt_kind<>'payment' or allocation.payment_id=p_receipt_id)
    and (p_receipt_kind<>'refund' or allocation.refund_id=p_receipt_id);
  v_snapshot:=pg_catalog.jsonb_build_object(
    'receiptKind',p_receipt_kind,'receiptId',p_receipt_id,'invoiceId',p_invoice_id,
    'tenantName',v_tenant.name,'tenantColor',v_tenant.primary_color,
    'companyName',v_company.company_name,
    'customerName',(select profile.full_name from public.profiles profile where profile.id=v_invoice.customer_profile_id),
    'label',v_invoice.label,'currency',v_invoice.currency,'subtotalMinor',v_subtotal,
    'discountMinor',v_discount,'vatMinor',v_vat,'totalMinor',v_invoice.amount_minor,
    'paidMinor',v_paid,'refundedMinor',v_refunded,'status',p_status,'occurredAt',v_occurred,
    'paymentMethod',p_payment_method,'lines',v_lines,'refunds',v_refunds);
  insert into public.finance_receipt_snapshots(
    operation_receipt_id,tenant_id,company_id,receipt_kind,receipt_id,invoice_id,snapshot
  ) values(p_operation_receipt_id,v_invoice.tenant_id,v_invoice.company_id,p_receipt_kind,
    p_receipt_id,p_invoice_id,v_snapshot);
end;
$$;

create function private.p309_event_uuid(p_seed text)
returns uuid language sql immutable security definer set search_path = '' as $$
  select (pg_catalog.substr(h,1,8)||'-'||pg_catalog.substr(h,9,4)||'-4'||
    pg_catalog.substr(h,14,3)||'-a'||pg_catalog.substr(h,18,3)||'-'||pg_catalog.substr(h,21,12))::uuid
  from (select pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p_seed,'UTF8')),'hex') h) value;
$$;

create function private.p309_publish_event(
  p_event_type text, p_tenant_id uuid, p_company_id uuid, p_actor_id uuid,
  p_operation_id uuid, p_payload jsonb
) returns void language plpgsql security definer set search_path = '' as $$
declare v_seed text := p_event_type || ':1:' || p_tenant_id::text || ':' || p_company_id::text
  || ':' || p_actor_id::text || ':' || p_operation_id::text;
begin
  perform public.publish_domain_event(
    private.p309_event_uuid(v_seed), p_event_type, 1::smallint,
    pg_catalog.clock_timestamp(), p_tenant_id, p_company_id, p_actor_id,
    p_operation_id, null::uuid, 'internal', p_payload,
    pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(v_seed,'UTF8')),'hex')
  );
end;
$$;

create function public.p309_create_invoice_draft(
  p_tenant_id uuid, p_company_id uuid, p_actor_id uuid, p_operation_id uuid,
  p_expected_version bigint, p_payload_hash text, p_customer_profile_id uuid,
  p_label text, p_due_date date, p_lines jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_replay jsonb; v_invoice_id uuid := gen_random_uuid(); v_receipt_id uuid;
  v_customer_profile_id uuid;
  v_line jsonb; v_number integer := 0; v_amount record;
  v_subtotal bigint := 0; v_vat bigint := 0; v_total bigint := 0; v_result jsonb;
  v_currency text;
begin
  v_currency := p_lines->0->>'currency';
  perform private.p309_assert_pro_finance_scope(p_actor_id,p_tenant_id,p_company_id);
  v_replay := private.p309_command_replay(p_actor_id,p_tenant_id,p_company_id,p_operation_id,p_payload_hash);
  if v_replay is not null then return v_replay || '{"replayed":true}'::jsonb; end if;
  if p_expected_version <> 0 or pg_catalog.char_length(pg_catalog.btrim(p_label)) not between 1 and 160
    or pg_catalog.jsonb_typeof(p_lines) <> 'array' or pg_catalog.jsonb_array_length(p_lines) not between 1 and 500
    or not exists (select 1 from public.finance_currencies currency where currency.code=v_currency)
  then raise exception using errcode='22023', message='VALIDATION_FAILED'; end if;
  if p_customer_profile_id is null or not exists (
    select 1 from public.customer_profiles customer
    join public.profiles profile on profile.id=customer.profile_id
      and profile.tenant_id=p_tenant_id and profile.role='customer' and profile.status='active'
    where customer.profile_id=p_customer_profile_id and customer.linked_company_id=p_company_id
  ) then raise exception using errcode='42501', message='FORBIDDEN'; end if;
  v_customer_profile_id:=p_customer_profile_id;
  insert into public.invoices (
    id,tenant_id,company_id,customer_profile_id,linked_entity_type,label,amount_minor,
    currency,status,due_at,created_by,ledger_eligible,version
  ) values (
    v_invoice_id,p_tenant_id,p_company_id,v_customer_profile_id,'manual',pg_catalog.btrim(p_label),0,
    v_currency,'draft',p_due_date,p_actor_id,true,1
  );
  for v_line in select value from pg_catalog.jsonb_array_elements(p_lines) loop
    v_number := v_number + 1;
    if (v_line->>'currency') is distinct from v_currency
      or (v_line->>'taxCategory') not in ('standard','exempt','zero_rated')
      or ((v_line->>'taxCategory')='standard' and (v_line->>'taxBasis') not in ('exclusive','inclusive'))
      or ((v_line->>'taxCategory') in ('exempt','zero_rated') and (v_line->>'taxBasis') is distinct from (v_line->>'taxCategory'))
    then raise exception using errcode='22023', message='VALIDATION_FAILED'; end if;
    select * into v_amount from private.p309_line_amounts(
      (v_line->>'quantity')::bigint,(v_line->>'unitAmountMinor')::bigint,
      (v_line->>'discountMinor')::bigint,v_line->>'taxBasis',(v_line->>'vatBasisPoints')::integer
    );
    insert into public.invoice_lines (
      tenant_id,company_id,invoice_id,line_number,description,quantity,unit_amount_minor,
      discount_minor,tax_category,tax_basis,vat_basis_points,net_minor,vat_minor,total_minor,currency
    ) values (
      p_tenant_id,p_company_id,v_invoice_id,v_number,pg_catalog.btrim(v_line->>'description'),
      (v_line->>'quantity')::bigint,(v_line->>'unitAmountMinor')::bigint,
      (v_line->>'discountMinor')::bigint,v_line->>'taxCategory',v_line->>'taxBasis',
      (v_line->>'vatBasisPoints')::integer,v_amount.net_minor,v_amount.vat_minor,v_amount.total_minor,v_currency
    );
    v_subtotal := v_subtotal + v_amount.net_minor; v_vat := v_vat + v_amount.vat_minor;
    v_total := v_total + v_amount.total_minor;
  end loop;
  if v_total<=0 then raise exception using errcode='22023', message='VALIDATION_FAILED'; end if;
  update public.invoices set amount_minor=v_total where id=v_invoice_id;
  v_result := pg_catalog.jsonb_build_object('invoiceId',v_invoice_id,'version',1,'replayed',false);
  v_receipt_id := private.p309_command_receipt(p_tenant_id,p_company_id,p_actor_id,p_operation_id,
    'invoice',v_invoice_id,0,1,p_payload_hash,v_result);
  perform private.p309_command_audit(p_tenant_id,p_company_id,p_actor_id,v_receipt_id,
    'finance.invoice_created','invoice',v_invoice_id,pg_catalog.jsonb_build_object('amount_minor',v_total,'currency',v_currency));
  perform private.p309_publish_event('finance.invoice.created',p_tenant_id,p_company_id,p_actor_id,p_operation_id,
    pg_catalog.jsonb_build_object('resource_id',v_invoice_id,'operation_id',p_operation_id,'version',1,
      'state','draft','amount_minor',v_total,'currency',v_currency));
  return v_result;
end;
$$;

create function public.p309_finalize_invoice(
  p_tenant_id uuid,p_company_id uuid,p_actor_id uuid,p_operation_id uuid,
  p_expected_version bigint,p_payload_hash text,p_invoice_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_invoice public.invoices%rowtype; v_version bigint; v_receipt uuid;
  v_journal uuid := gen_random_uuid(); v_subtotal bigint; v_vat bigint; v_result jsonb; v_line integer:=1;
begin
  perform private.p309_assert_pro_finance_scope(p_actor_id,p_tenant_id,p_company_id);
  v_replay:=private.p309_command_replay(p_actor_id,p_tenant_id,p_company_id,p_operation_id,p_payload_hash);
  if v_replay is not null then return v_replay||'{"replayed":true}'::jsonb; end if;
  select * into v_invoice from public.invoices where id=p_invoice_id and tenant_id=p_tenant_id and company_id=p_company_id for update;
  if not found or not v_invoice.ledger_eligible then raise exception using errcode='P0001',message='NOT_FOUND'; end if;
  perform private.p309_assert_expected_version(v_invoice.version,p_expected_version);
  if v_invoice.status<>'draft' then raise exception using errcode='23514',message='CONFLICT'; end if;
  select pg_catalog.sum(net_minor),pg_catalog.sum(vat_minor) into v_subtotal,v_vat
    from public.invoice_lines where invoice_id=p_invoice_id and tenant_id=p_tenant_id and company_id=p_company_id;
  update public.invoices set status='open',finalized_at=pg_catalog.clock_timestamp(),version=version+1
    where id=p_invoice_id returning version into v_version;
  v_result:=pg_catalog.jsonb_build_object('invoiceId',p_invoice_id,'version',v_version,'replayed',false);
  v_receipt:=private.p309_command_receipt(p_tenant_id,p_company_id,p_actor_id,p_operation_id,
    'invoice',p_invoice_id,p_expected_version,v_version,p_payload_hash,v_result);
  insert into public.finance_journals(id,tenant_id,company_id,operation_receipt_id,source_kind,source_id,currency,accounting_at)
    values(v_journal,p_tenant_id,p_company_id,v_receipt,'invoice',p_invoice_id,v_invoice.currency,pg_catalog.clock_timestamp());
  insert into public.finance_journal_entries(journal_id,line_number,account_code,debit_minor,currency)
    values(v_journal,v_line,'receivable',v_invoice.amount_minor,v_invoice.currency); v_line:=v_line+1;
  if v_subtotal>0 then insert into public.finance_journal_entries(journal_id,line_number,account_code,credit_minor,currency)
    values(v_journal,v_line,'service_revenue',v_subtotal,v_invoice.currency); v_line:=v_line+1; end if;
  if v_vat>0 then insert into public.finance_journal_entries(journal_id,line_number,account_code,credit_minor,currency)
    values(v_journal,v_line,'vat_payable',v_vat,v_invoice.currency); end if;
  perform private.p309_post_journal(v_journal);
  perform private.p309_capture_receipt_snapshot(v_receipt,'invoice',p_invoice_id,p_invoice_id,
    v_journal,'open',null);
  perform private.p309_command_audit(p_tenant_id,p_company_id,p_actor_id,v_receipt,'finance.invoice_finalized','invoice',p_invoice_id,'{}');
  perform private.p309_publish_event('finance.invoice.finalized',p_tenant_id,p_company_id,p_actor_id,p_operation_id,
    pg_catalog.jsonb_build_object('resource_id',p_invoice_id,'operation_id',p_operation_id,'version',v_version,
      'state','open','amount_minor',v_invoice.amount_minor,'currency',v_invoice.currency));
  return v_result;
end;
$$;

create function public.p309_allocate_manual_payment(
  p_tenant_id uuid,p_company_id uuid,p_actor_id uuid,p_operation_id uuid,
  p_expected_version bigint,p_payload_hash text,p_invoice_id uuid,p_amount_minor bigint,
  p_method text,p_note text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_invoice public.invoices%rowtype; v_payment uuid:=gen_random_uuid();
  v_allocation uuid:=gen_random_uuid(); v_receipt uuid; v_journal uuid:=gen_random_uuid();
  v_applied bigint; v_version bigint; v_result jsonb; v_status text;
begin
  perform private.p309_assert_pro_finance_scope(p_actor_id,p_tenant_id,p_company_id);
  v_replay:=private.p309_command_replay(p_actor_id,p_tenant_id,p_company_id,p_operation_id,p_payload_hash);
  if v_replay is not null then return v_replay||'{"replayed":true}'::jsonb; end if;
  select * into v_invoice from public.invoices where id=p_invoice_id and tenant_id=p_tenant_id and company_id=p_company_id for update;
  if not found or not v_invoice.ledger_eligible then raise exception using errcode='P0001',message='NOT_FOUND'; end if;
  perform private.p309_assert_expected_version(v_invoice.version,p_expected_version);
  if v_invoice.status<>'open' or p_amount_minor<=0 or p_method not in ('cash','bank_transfer') then
    raise exception using errcode='23514',message='CONFLICT'; end if;
  select coalesce(pg_catalog.sum(amount_minor)::bigint,0::bigint) into v_applied from public.payment_allocations where invoice_id=p_invoice_id;
  if v_applied+p_amount_minor>v_invoice.amount_minor then raise exception using errcode='23514',message='OVERPAYMENT'; end if;
  insert into public.payments(id,tenant_id,invoice_id,provider,amount_minor,currency,method,status,received_at)
    values(v_payment,p_tenant_id,p_invoice_id,'manual',p_amount_minor,v_invoice.currency,p_method,'succeeded',pg_catalog.clock_timestamp());
  v_status:=case when v_applied+p_amount_minor=v_invoice.amount_minor then 'paid' else 'open' end;
  update public.invoices set status=v_status,paid_at=case when v_status='paid' then pg_catalog.clock_timestamp() else null end,
    version=version+1 where id=p_invoice_id returning version into v_version;
  v_result:=pg_catalog.jsonb_build_object('invoiceId',p_invoice_id,'paymentId',v_payment,'version',v_version,'replayed',false);
  v_receipt:=private.p309_command_receipt(p_tenant_id,p_company_id,p_actor_id,p_operation_id,
    'payment',v_payment,p_expected_version,v_version,p_payload_hash,v_result);
  insert into public.payment_allocations(id,tenant_id,company_id,invoice_id,payment_id,operation_receipt_id,amount_minor,currency)
    values(v_allocation,p_tenant_id,p_company_id,p_invoice_id,v_payment,v_receipt,p_amount_minor,v_invoice.currency);
  insert into public.finance_journals(id,tenant_id,company_id,operation_receipt_id,source_kind,source_id,currency,accounting_at)
    values(v_journal,p_tenant_id,p_company_id,v_receipt,'payment_allocation',v_allocation,v_invoice.currency,pg_catalog.clock_timestamp());
  insert into public.finance_journal_entries(journal_id,line_number,account_code,debit_minor,currency) values
    (v_journal,1,case when p_method='cash' then 'cash_clearing' else 'bank_clearing' end,p_amount_minor,v_invoice.currency);
  insert into public.finance_journal_entries(journal_id,line_number,account_code,credit_minor,currency)
    values(v_journal,2,'receivable',p_amount_minor,v_invoice.currency);
  perform private.p309_post_journal(v_journal);
  perform private.p309_capture_receipt_snapshot(v_receipt,'payment',v_payment,p_invoice_id,
    v_journal,'succeeded',p_method);
  perform private.p309_command_audit(p_tenant_id,p_company_id,p_actor_id,v_receipt,'finance.payment_allocated','payment',v_payment,
    pg_catalog.jsonb_build_object('invoice_id',p_invoice_id,'amount_minor',p_amount_minor,'currency',v_invoice.currency));
  perform private.p309_publish_event('finance.payment.allocated',p_tenant_id,p_company_id,p_actor_id,p_operation_id,
    pg_catalog.jsonb_build_object('resource_id',v_payment,'invoice_id',p_invoice_id,'operation_id',p_operation_id,
      'version',v_version,'state','allocated','amount_minor',p_amount_minor,'currency',v_invoice.currency));
  return v_result;
end;
$$;

create function public.p309_void_invoice(
  p_tenant_id uuid,p_company_id uuid,p_actor_id uuid,p_operation_id uuid,
  p_expected_version bigint,p_payload_hash text,p_invoice_id uuid,p_reason text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_invoice public.invoices%rowtype; v_receipt uuid; v_journal uuid:=gen_random_uuid();
  v_version bigint; v_result jsonb; v_subtotal bigint; v_vat bigint; v_line integer:=1;
begin
  perform private.p309_assert_pro_finance_scope(p_actor_id,p_tenant_id,p_company_id);
  v_replay:=private.p309_command_replay(p_actor_id,p_tenant_id,p_company_id,p_operation_id,p_payload_hash);
  if v_replay is not null then return v_replay||'{"replayed":true}'::jsonb; end if;
  select * into v_invoice from public.invoices where id=p_invoice_id and tenant_id=p_tenant_id and company_id=p_company_id for update;
  if not found or not v_invoice.ledger_eligible then raise exception using errcode='P0001',message='NOT_FOUND'; end if;
  perform private.p309_assert_expected_version(v_invoice.version,p_expected_version);
  if v_invoice.status<>'open' or pg_catalog.char_length(pg_catalog.btrim(p_reason)) not between 3 and 500
    or exists(select 1 from public.payment_allocations where invoice_id=p_invoice_id)
  then raise exception using errcode='23514',message='CONFLICT'; end if;
  select pg_catalog.sum(net_minor),pg_catalog.sum(vat_minor) into v_subtotal,v_vat from public.invoice_lines where invoice_id=p_invoice_id;
  update public.invoices set status='void',void_reason=pg_catalog.btrim(p_reason),voided_at=pg_catalog.clock_timestamp(),version=version+1
    where id=p_invoice_id returning version into v_version;
  v_result:=pg_catalog.jsonb_build_object('invoiceId',p_invoice_id,'version',v_version,'replayed',false);
  v_receipt:=private.p309_command_receipt(p_tenant_id,p_company_id,p_actor_id,p_operation_id,'invoice',p_invoice_id,
    p_expected_version,v_version,p_payload_hash,v_result);
  insert into public.finance_journals(id,tenant_id,company_id,operation_receipt_id,source_kind,source_id,currency,accounting_at)
    values(v_journal,p_tenant_id,p_company_id,v_receipt,'invoice_void',p_invoice_id,v_invoice.currency,pg_catalog.clock_timestamp());
  if v_subtotal>0 then insert into public.finance_journal_entries(journal_id,line_number,account_code,debit_minor,currency)
    values(v_journal,v_line,'service_revenue',v_subtotal,v_invoice.currency); v_line:=v_line+1; end if;
  if v_vat>0 then insert into public.finance_journal_entries(journal_id,line_number,account_code,debit_minor,currency)
    values(v_journal,v_line,'vat_payable',v_vat,v_invoice.currency); v_line:=v_line+1; end if;
  insert into public.finance_journal_entries(journal_id,line_number,account_code,credit_minor,currency)
    values(v_journal,v_line,'receivable',v_invoice.amount_minor,v_invoice.currency);
  perform private.p309_post_journal(v_journal);
  perform private.p309_command_audit(p_tenant_id,p_company_id,p_actor_id,v_receipt,'finance.invoice_voided','invoice',p_invoice_id,'{}');
  perform private.p309_publish_event('finance.invoice.voided',p_tenant_id,p_company_id,p_actor_id,p_operation_id,
    pg_catalog.jsonb_build_object('resource_id',p_invoice_id,'operation_id',p_operation_id,'version',v_version,
      'state','void','amount_minor',v_invoice.amount_minor,'currency',v_invoice.currency));
  return v_result;
end;
$$;

create function public.p309_prepare_refund(
  p_tenant_id uuid,p_company_id uuid,p_actor_id uuid,p_operation_id uuid,
  p_expected_version bigint,p_payload_hash text,p_invoice_id uuid,p_payment_id uuid,
  p_amount_minor bigint,p_reason text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_invoice public.invoices%rowtype; v_payment public.payments%rowtype;
  v_refund uuid:=gen_random_uuid(); v_receipt uuid; v_version bigint; v_result jsonb; v_available bigint;
begin
  perform private.p309_assert_pro_finance_scope(p_actor_id,p_tenant_id,p_company_id);
  v_replay:=private.p309_command_replay(p_actor_id,p_tenant_id,p_company_id,p_operation_id,p_payload_hash);
  if v_replay is not null then return v_replay||'{"replayed":true}'::jsonb; end if;
  select * into v_invoice from public.invoices where id=p_invoice_id and tenant_id=p_tenant_id and company_id=p_company_id for update;
  select * into v_payment from public.payments where id=p_payment_id and tenant_id=p_tenant_id and invoice_id=p_invoice_id for update;
  if v_invoice.id is null or v_payment.id is null or not v_invoice.ledger_eligible or v_payment.status not in ('succeeded','partially_refunded')
  then raise exception using errcode='P0001',message='NOT_FOUND'; end if;
  perform private.p309_assert_expected_version(v_invoice.version,p_expected_version);
  select coalesce(pg_catalog.sum(a.amount_minor)::bigint,0::bigint)-coalesce((select pg_catalog.sum(refund.amount_minor)::bigint
    from public.refunds refund where refund.tenant_id=p_tenant_id and refund.payment_id=p_payment_id
      and refund.ledger_eligible and refund.status in ('pending','succeeded')),0::bigint) into v_available
    from public.payment_allocations a where a.payment_id=p_payment_id;
  if p_amount_minor<=0 or p_amount_minor>v_available then raise exception using errcode='23514',message='REFUND_EXCEEDS_CAPTURE'; end if;
  update public.invoices set version=version+1 where id=p_invoice_id returning version into v_version;
  insert into public.refunds(id,tenant_id,payment_id,amount_minor,currency,reason,status,idempotency_key,provider_idempotency_key,ledger_eligible,quarantine_reason)
    values(v_refund,p_tenant_id,p_payment_id,p_amount_minor,v_payment.currency,pg_catalog.btrim(p_reason),'pending',p_operation_id::text,
      'p309-refund-'||v_refund::text,true,null);
  v_result:=pg_catalog.jsonb_build_object('invoiceId',p_invoice_id,'paymentId',p_payment_id,'refundId',v_refund,
    'provider',v_payment.provider,'providerChargeId',v_payment.provider_charge_id,'providerIdempotencyKey','p309-refund-'||v_refund::text,
    'currency',v_payment.currency,'status','pending','version',v_version,'replayed',false);
  v_receipt:=private.p309_command_receipt(p_tenant_id,p_company_id,p_actor_id,p_operation_id,'refund',v_refund,
    p_expected_version,v_version,p_payload_hash,v_result);
  perform private.p309_command_audit(p_tenant_id,p_company_id,p_actor_id,v_receipt,'finance.refund_prepared','refund',v_refund,
    pg_catalog.jsonb_build_object('invoice_id',p_invoice_id,'payment_id',p_payment_id,'amount_minor',p_amount_minor,'currency',v_payment.currency));
  perform private.p309_publish_event('finance.refund.prepared',p_tenant_id,p_company_id,p_actor_id,p_operation_id,
    pg_catalog.jsonb_build_object('resource_id',v_refund,'invoice_id',p_invoice_id,'payment_id',p_payment_id,
      'operation_id',p_operation_id,'version',v_version,'state','pending','amount_minor',p_amount_minor,'currency',v_payment.currency));
  return v_result;
end;
$$;

create function public.p309_attach_pending_refund(
  p_tenant_id uuid,p_company_id uuid,p_actor_id uuid,p_operation_id uuid,
  p_expected_version bigint,p_payload_hash text,p_invoice_id uuid,p_payment_id uuid,
  p_refund_id uuid,p_provider_refund_id text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_invoice public.invoices%rowtype; v_payment public.payments%rowtype; v_refund public.refunds%rowtype;
  v_version bigint; v_receipt uuid; v_result jsonb;
begin
  perform private.p309_assert_pro_finance_scope(p_actor_id,p_tenant_id,p_company_id);
  v_replay:=private.p309_command_replay(p_actor_id,p_tenant_id,p_company_id,p_operation_id,p_payload_hash);
  if v_replay is not null then return v_replay||'{"replayed":true}'::jsonb; end if;
  select * into v_invoice from public.invoices where id=p_invoice_id and tenant_id=p_tenant_id and company_id=p_company_id for update;
  select * into v_payment from public.payments where id=p_payment_id and tenant_id=p_tenant_id and invoice_id=p_invoice_id for update;
  select * into v_refund from public.refunds where id=p_refund_id and tenant_id=p_tenant_id and payment_id=p_payment_id for update;
  if v_invoice.id is null or v_payment.id is null or v_refund.id is null then raise exception using errcode='P0001',message='NOT_FOUND'; end if;
  perform private.p309_assert_expected_version(v_invoice.version,p_expected_version);
  if v_refund.status<>'pending' or p_provider_refund_id is null or pg_catalog.btrim(p_provider_refund_id)=''
    or (v_refund.provider_refund_id is not null and v_refund.provider_refund_id<>p_provider_refund_id)
  then raise exception using errcode='23514',message='CONFLICT'; end if;
  update public.refunds set provider_refund_id=p_provider_refund_id where id=p_refund_id;
  update public.invoices set version=version+1 where id=p_invoice_id returning version into v_version;
  v_result:=pg_catalog.jsonb_build_object('invoiceId',p_invoice_id,'paymentId',p_payment_id,'refundId',p_refund_id,
    'partial',true,'status','pending','version',v_version,'replayed',false);
  v_receipt:=private.p309_command_receipt(p_tenant_id,p_company_id,p_actor_id,p_operation_id,'refund',p_refund_id,
    p_expected_version,v_version,p_payload_hash,v_result);
  perform private.p309_command_audit(p_tenant_id,p_company_id,p_actor_id,v_receipt,'finance.refund_provider_attached',
    'refund',p_refund_id,pg_catalog.jsonb_build_object('invoice_id',p_invoice_id,'payment_id',p_payment_id,'status','pending'));
  return v_result;
end;
$$;

create function private.p309_reconcile_refund_core(
  p_tenant_id uuid,p_company_id uuid,p_actor_id uuid,p_operation_id uuid,
  p_expected_version bigint,p_payload_hash text,p_invoice_id uuid,p_payment_id uuid,
  p_refund_id uuid,p_provider_refund_id text,p_status text,p_service_recovery boolean
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb; v_invoice public.invoices%rowtype; v_payment public.payments%rowtype; v_refund public.refunds%rowtype;
  v_receipt uuid; v_version bigint; v_result jsonb; v_total_refunded bigint; v_total_allocated bigint;
  v_payment_refunded bigint; v_payment_allocated bigint; v_payment_partial boolean;
  v_payment_allocation uuid; v_refund_allocation uuid:=gen_random_uuid(); v_credit_note uuid:=gen_random_uuid();
  v_credit_receipt uuid; v_credit_operation uuid; v_credit_journal uuid:=gen_random_uuid(); v_cash_journal uuid:=gen_random_uuid(); v_partial boolean;
  v_invoice_vat bigint; v_prior_refunded bigint; v_prior_vat bigint; v_cumulative_vat bigint; v_refund_vat bigint; v_refund_net bigint;
begin
  if p_service_recovery then
    if session_user<>'postgres' and coalesce(auth.role(),'')<>'service_role'
    then raise exception using errcode='42501',message='FORBIDDEN'; end if;
  end if;
  v_replay:=private.p309_command_replay(p_actor_id,p_tenant_id,p_company_id,p_operation_id,p_payload_hash);
  if v_replay is not null then return v_replay||'{"replayed":true}'::jsonb; end if;
  select * into v_invoice from public.invoices where id=p_invoice_id and tenant_id=p_tenant_id and company_id=p_company_id for update;
  select * into v_payment from public.payments where id=p_payment_id and tenant_id=p_tenant_id and invoice_id=p_invoice_id for update;
  select * into v_refund from public.refunds where id=p_refund_id and tenant_id=p_tenant_id and payment_id=p_payment_id for update;
  if v_invoice.id is null or v_payment.id is null or v_refund.id is null then raise exception using errcode='P0001',message='NOT_FOUND'; end if;
  perform private.p309_assert_expected_version(v_invoice.version,p_expected_version);
  if p_status not in ('pending','succeeded','failed') or v_refund.status<>'pending' then raise exception using errcode='23514',message='CONFLICT'; end if;
  update public.invoices set version=version+1 where id=p_invoice_id returning version into v_version;
  update public.refunds set status=p_status,provider_refund_id=p_provider_refund_id where id=p_refund_id;
  if p_status='succeeded' then
    select id into v_payment_allocation from public.payment_allocations where payment_id=p_payment_id order by allocated_at,id limit 1 for update;
    select coalesce(pg_catalog.sum(amount_minor)::bigint,0::bigint)+v_refund.amount_minor into v_payment_refunded
      from public.refund_allocations where payment_id=p_payment_id;
    select coalesce(pg_catalog.sum(amount_minor)::bigint,0::bigint) into v_payment_allocated
      from public.payment_allocations where payment_id=p_payment_id;
    v_payment_partial:=v_payment_refunded<v_payment_allocated;
    select coalesce(pg_catalog.sum(amount_minor)::bigint,0::bigint)+v_refund.amount_minor into v_total_refunded
      from public.refund_allocations where invoice_id=p_invoice_id;
    select coalesce(pg_catalog.sum(amount_minor)::bigint,0::bigint) into v_total_allocated
      from public.payment_allocations where invoice_id=p_invoice_id;
    v_partial:=v_total_refunded<v_total_allocated;
    select coalesce(pg_catalog.sum(vat_minor)::bigint,0::bigint) into v_invoice_vat
      from public.invoice_lines where invoice_id=p_invoice_id and tenant_id=p_tenant_id and company_id=p_company_id;
    v_prior_refunded:=v_total_refunded-v_refund.amount_minor;
    v_prior_vat:=private.p309_round_half_away_from_zero(v_invoice_vat::numeric*v_prior_refunded::numeric/v_invoice.amount_minor::numeric);
    v_cumulative_vat:=private.p309_round_half_away_from_zero(v_invoice_vat::numeric*v_total_refunded::numeric/v_invoice.amount_minor::numeric);
    v_refund_vat:=v_cumulative_vat-v_prior_vat;
    v_refund_net:=v_refund.amount_minor-v_refund_vat;
    v_result:=pg_catalog.jsonb_build_object('invoiceId',p_invoice_id,'paymentId',p_payment_id,'refundId',p_refund_id,
      'partial',v_partial,'status',p_status,'version',v_version,'replayed',false);
    v_receipt:=private.p309_command_receipt(p_tenant_id,p_company_id,p_actor_id,p_operation_id,'refund',p_refund_id,
      p_expected_version,v_version,p_payload_hash,v_result);
    insert into public.refund_allocations(id,tenant_id,company_id,invoice_id,payment_id,refund_id,payment_allocation_id,
      operation_receipt_id,amount_minor,currency) values(v_refund_allocation,p_tenant_id,p_company_id,p_invoice_id,p_payment_id,
      p_refund_id,v_payment_allocation,v_receipt,v_refund.amount_minor,v_refund.currency);
    v_credit_operation:=private.p309_event_uuid('refund-credit-note:'||p_operation_id::text);
    v_credit_receipt:=private.p309_command_receipt(p_tenant_id,p_company_id,p_actor_id,v_credit_operation,'credit_note',v_credit_note,
      p_expected_version,v_version,p_payload_hash,pg_catalog.jsonb_build_object('creditNoteId',v_credit_note,'invoiceId',p_invoice_id,
        'amountMinor',v_refund.amount_minor,'currency',v_refund.currency));
    insert into public.finance_credit_notes(id,tenant_id,company_id,invoice_id,operation_receipt_id,amount_minor,currency,reason)
      values(v_credit_note,p_tenant_id,p_company_id,p_invoice_id,v_credit_receipt,v_refund.amount_minor,v_refund.currency,v_refund.reason);
    update public.payments set status=case when v_payment_partial then 'partially_refunded' else 'refunded' end where id=p_payment_id;
    update public.invoices set status=case when v_partial then 'partially_refunded' else 'refunded' end where id=p_invoice_id;
    insert into public.finance_journals(id,tenant_id,company_id,operation_receipt_id,source_kind,source_id,currency,accounting_at)
      values(v_credit_journal,p_tenant_id,p_company_id,v_credit_receipt,'credit_note',v_credit_note,v_refund.currency,pg_catalog.clock_timestamp());
    if v_refund_net>0 then insert into public.finance_journal_entries(journal_id,line_number,account_code,debit_minor,currency)
      values(v_credit_journal,1,'refund_contra_revenue',v_refund_net,v_refund.currency); end if;
    if v_refund_vat>0 then insert into public.finance_journal_entries(journal_id,line_number,account_code,debit_minor,currency)
      values(v_credit_journal,2,'vat_payable',v_refund_vat,v_refund.currency); end if;
    insert into public.finance_journal_entries(journal_id,line_number,account_code,credit_minor,currency)
      values(v_credit_journal,3,'receivable',v_refund.amount_minor,v_refund.currency);
    perform private.p309_post_journal(v_credit_journal);
    insert into public.finance_journals(id,tenant_id,company_id,operation_receipt_id,source_kind,source_id,currency,accounting_at)
      values(v_cash_journal,p_tenant_id,p_company_id,v_receipt,'cash_refund',p_refund_id,v_refund.currency,pg_catalog.clock_timestamp());
    insert into public.finance_journal_entries(journal_id,line_number,account_code,debit_minor,currency)
      values(v_cash_journal,1,'receivable',v_refund.amount_minor,v_refund.currency);
    insert into public.finance_journal_entries(journal_id,line_number,account_code,credit_minor,currency)
      values(v_cash_journal,2,case when v_payment.method='cash' then 'cash_clearing' else 'bank_clearing' end,v_refund.amount_minor,v_refund.currency);
    perform private.p309_post_journal(v_cash_journal);
    perform private.p309_capture_receipt_snapshot(v_receipt,'refund',p_refund_id,p_invoice_id,
      v_cash_journal,'succeeded',v_payment.method);
  else
    v_partial:=true;
    v_result:=pg_catalog.jsonb_build_object('invoiceId',p_invoice_id,'paymentId',p_payment_id,'refundId',p_refund_id,
      'partial',v_partial,'status',p_status,'version',v_version,'replayed',false);
    v_receipt:=private.p309_command_receipt(p_tenant_id,p_company_id,p_actor_id,p_operation_id,'refund',p_refund_id,
      p_expected_version,v_version,p_payload_hash,v_result);
  end if;
  perform private.p309_command_audit(p_tenant_id,p_company_id,p_actor_id,v_receipt,'finance.refund_reconciled','refund',p_refund_id,
    pg_catalog.jsonb_build_object('invoice_id',p_invoice_id,'payment_id',p_payment_id,'status',p_status));
  perform private.p309_publish_event('finance.refund.reconciled',p_tenant_id,p_company_id,p_actor_id,p_operation_id,
    pg_catalog.jsonb_build_object('resource_id',p_refund_id,'invoice_id',p_invoice_id,'payment_id',p_payment_id,
      'operation_id',p_operation_id,'version',v_version,'state',p_status,'amount_minor',v_refund.amount_minor,'currency',v_refund.currency));
  return v_result;
end;
$$;

create function public.p309_reconcile_refund(
  p_tenant_id uuid,p_company_id uuid,p_actor_id uuid,p_operation_id uuid,
  p_expected_version bigint,p_payload_hash text,p_invoice_id uuid,p_payment_id uuid,
  p_refund_id uuid,p_provider_refund_id text,p_status text
) returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform private.p309_assert_pro_finance_scope(p_actor_id,p_tenant_id,p_company_id);
  return private.p309_reconcile_refund_core(p_tenant_id,p_company_id,p_actor_id,p_operation_id,
    p_expected_version,p_payload_hash,p_invoice_id,p_payment_id,p_refund_id,p_provider_refund_id,p_status,false);
end;
$$;

create function public.p309_reconcile_pending_refund(
  p_refund_id uuid,p_provider_refund_id text,p_status text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_refund public.refunds%rowtype; v_payment public.payments%rowtype; v_invoice public.invoices%rowtype;
  v_actor uuid; v_operation uuid; v_hash text;
begin
  if p_status not in ('succeeded','failed') or p_provider_refund_id is null then
    raise exception using errcode='22023',message='VALIDATION_FAILED'; end if;
  select * into v_refund from public.refunds where id=p_refund_id and status='pending' and provider_refund_id=p_provider_refund_id;
  select * into v_payment from public.payments where id=v_refund.payment_id and tenant_id=v_refund.tenant_id;
  select * into v_invoice from public.invoices where id=v_payment.invoice_id and tenant_id=v_refund.tenant_id for update;
  select * into v_payment from public.payments where id=v_refund.payment_id and tenant_id=v_refund.tenant_id
    and invoice_id=v_invoice.id for update;
  select * into v_refund from public.refunds where id=p_refund_id and tenant_id=v_invoice.tenant_id
    and payment_id=v_payment.id and status='pending' and provider_refund_id=p_provider_refund_id for update;
  select actor_id into v_actor from public.finance_operation_receipts
    where aggregate_kind='refund' and aggregate_id=p_refund_id order by committed_at,id limit 1;
  if v_refund.id is null or v_payment.id is null or v_invoice.id is null or v_actor is null
  then raise exception using errcode='P0001',message='NOT_FOUND'; end if;
  v_operation:=private.p309_event_uuid('refund-recovery:'||p_refund_id::text||':'||p_status||':'||p_provider_refund_id);
  v_hash:=pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
    v_invoice.id::text||':'||v_payment.id::text||':'||p_refund_id::text||':'||p_provider_refund_id||':'||p_status,'UTF8')),'hex');
  return private.p309_reconcile_refund_core(v_invoice.tenant_id,v_invoice.company_id,v_actor,v_operation,
    v_invoice.version,v_hash,v_invoice.id,v_payment.id,p_refund_id,p_provider_refund_id,p_status,true);
end;
$$;

create function public.p309_list_company_invoices(
  p_tenant_id uuid,p_company_id uuid,p_actor_id uuid,p_before_created_at timestamptz default null,
  p_before_id uuid default null,p_limit integer default 50,p_view text default 'all',
  p_today date default null,p_date date default null,p_period text default null
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_rows jsonb; v_total bigint; v_limit integer:=least(100,greatest(1,coalesce(p_limit,50)));
  v_today date:=coalesce(p_today,(pg_catalog.clock_timestamp() at time zone 'Asia/Dubai')::date);
begin
  if (p_before_created_at is null) <> (p_before_id is null) then
    raise exception using errcode='22023',message='VALIDATION_FAILED';
  end if;
  if p_view not in ('all','billed','paid','due-soon','overdue','due-date') then
    raise exception using errcode='22023',message='VALIDATION_FAILED';
  end if;
  perform private.p309_assert_pro_finance_scope(p_actor_id,p_tenant_id,p_company_id);
  select count(*) into v_total from public.invoices invoice
  where invoice.tenant_id=p_tenant_id and invoice.company_id=p_company_id and (
    p_view='all'
    or (p_view='billed' and exists(select 1 from public.finance_journals journal
      where journal.tenant_id=p_tenant_id and journal.company_id=p_company_id and journal.source_id=invoice.id
        and journal.source_kind in ('invoice','invoice_void') and journal.state='posted'
        and (journal.accounting_at at time zone 'Asia/Dubai')::date>=pg_catalog.date_trunc('month',v_today)::date
        and (journal.accounting_at at time zone 'Asia/Dubai')::date<(pg_catalog.date_trunc('month',v_today)+interval '1 month')::date))
    or (p_view='paid' and invoice.status in ('paid','refunded','partially_refunded'))
    or (p_view='due-soon' and invoice.status='open' and invoice.due_at>=v_today and invoice.due_at<=v_today+30)
    or (p_view='overdue' and invoice.status='open' and invoice.due_at<v_today)
    or (p_view='due-date' and p_date is not null and p_period='afternoon' and invoice.status='open' and invoice.due_at=p_date)
  );
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(row_value) order by row_value.created_at desc,row_value.id desc),'[]')
  into v_rows from (
    select invoice.*,invoice.amount_minor-coalesce((select pg_catalog.sum(allocation.amount_minor)::bigint
      from public.payment_allocations allocation where allocation.invoice_id=invoice.id),0::bigint) outstanding_minor,
      exists(select 1 from public.finance_receipt_snapshots receipt
        where receipt.tenant_id=invoice.tenant_id and receipt.company_id=invoice.company_id
          and receipt.invoice_id=invoice.id and receipt.receipt_kind='invoice'
          and receipt.receipt_id=invoice.id) receipt_available
      from public.invoices invoice where invoice.tenant_id=p_tenant_id and invoice.company_id=p_company_id
      and (p_before_created_at is null or (invoice.created_at,invoice.id)<(p_before_created_at,p_before_id))
      and (p_view='all'
        or (p_view='billed' and exists(select 1 from public.finance_journals journal
          where journal.tenant_id=p_tenant_id and journal.company_id=p_company_id and journal.source_id=invoice.id
            and journal.source_kind in ('invoice','invoice_void') and journal.state='posted'
            and (journal.accounting_at at time zone 'Asia/Dubai')::date>=pg_catalog.date_trunc('month',v_today)::date
            and (journal.accounting_at at time zone 'Asia/Dubai')::date<(pg_catalog.date_trunc('month',v_today)+interval '1 month')::date))
        or (p_view='paid' and invoice.status in ('paid','refunded','partially_refunded'))
        or (p_view='due-soon' and invoice.status='open' and invoice.due_at>=v_today and invoice.due_at<=v_today+30)
        or (p_view='overdue' and invoice.status='open' and invoice.due_at<v_today)
        or (p_view='due-date' and p_date is not null and p_period='afternoon' and invoice.status='open' and invoice.due_at=p_date))
    order by invoice.created_at desc,invoice.id desc limit v_limit
  ) row_value;
  return pg_catalog.jsonb_build_object('rows',v_rows,'total',v_total,'limit',v_limit);
end;
$$;

create function public.p309_list_customer_invoices(
  p_tenant_id uuid,p_company_id uuid,p_customer_profile_id uuid,p_before_created_at timestamptz default null,
  p_before_id uuid default null,p_limit integer default 50,p_status text default 'all',
  p_today date default null,p_invoice_id uuid default null
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_rows jsonb;v_total bigint;v_limit integer:=least(100,greatest(1,coalesce(p_limit,50)));
begin
  if (p_before_created_at is null) <> (p_before_id is null) then
    raise exception using errcode='22023',message='VALIDATION_FAILED';
  end if;
  if p_status not in ('all','open','overdue','paid','cancelled') then
    raise exception using errcode='22023',message='VALIDATION_FAILED';
  end if;
  if not exists(select 1 from public.customer_profiles customer join public.profiles profile on profile.id=customer.profile_id
    join public.tenants tenant on tenant.id=p_tenant_id and tenant.status='active'
    where customer.profile_id=p_customer_profile_id and customer.linked_company_id=p_company_id and profile.tenant_id=p_tenant_id
      and profile.role='customer' and profile.status='active')
  then raise exception using errcode='42501',message='FORBIDDEN'; end if;
  select count(*) into v_total from public.invoices invoice where tenant_id=p_tenant_id and company_id=p_company_id
    and customer_profile_id=p_customer_profile_id and invoice.status<>'draft' and (p_invoice_id is null or invoice.id=p_invoice_id)
    and (p_status='all' or (p_status='open' and invoice.status='open')
      or (p_status='overdue' and invoice.status='open' and invoice.due_at<coalesce(p_today,(pg_catalog.clock_timestamp() at time zone 'Asia/Dubai')::date))
      or (p_status='paid' and invoice.status in ('paid','refunded','partially_refunded'))
      or (p_status='cancelled' and invoice.status='void'));
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(row_value) order by row_value.created_at desc,row_value.id desc),'[]') into v_rows from (
    select invoice.*,exists(select 1 from public.finance_receipt_snapshots receipt
      where receipt.tenant_id=invoice.tenant_id and receipt.company_id=invoice.company_id
        and receipt.invoice_id=invoice.id and receipt.receipt_kind='invoice'
        and receipt.receipt_id=invoice.id) receipt_available
    from public.invoices invoice where invoice.tenant_id=p_tenant_id and invoice.company_id=p_company_id
      and invoice.customer_profile_id=p_customer_profile_id
      and invoice.status<>'draft'
      and (p_before_created_at is null or (invoice.created_at,invoice.id)<(p_before_created_at,p_before_id))
      and (p_invoice_id is null or invoice.id=p_invoice_id)
      and (p_status='all' or (p_status='open' and invoice.status='open')
        or (p_status='overdue' and invoice.status='open' and invoice.due_at<coalesce(p_today,(pg_catalog.clock_timestamp() at time zone 'Asia/Dubai')::date))
        or (p_status='paid' and invoice.status in ('paid','refunded','partially_refunded'))
        or (p_status='cancelled' and invoice.status='void'))
    order by invoice.created_at desc,invoice.id desc limit v_limit
  ) row_value;
  return pg_catalog.jsonb_build_object('rows',v_rows,'total',v_total,'limit',v_limit);
end;
$$;

create function public.p309_get_customer_invoice(
  p_tenant_id uuid,p_company_id uuid,p_customer_profile_id uuid,p_invoice_id uuid
) returns jsonb language sql stable security definer set search_path = '' as $$
  select pg_catalog.to_jsonb(row_value) from (
  select invoice.*,exists(select 1 from public.finance_receipt_snapshots receipt
    where receipt.tenant_id=invoice.tenant_id and receipt.company_id=invoice.company_id
      and receipt.invoice_id=invoice.id and receipt.receipt_kind='invoice'
      and receipt.receipt_id=invoice.id) receipt_available
  from public.invoices invoice
  join public.customer_profiles customer on customer.profile_id=p_customer_profile_id and customer.linked_company_id=p_company_id
  join public.profiles profile on profile.id=customer.profile_id and profile.tenant_id=p_tenant_id
    and profile.role='customer' and profile.status='active'
  join public.tenants tenant on tenant.id=p_tenant_id and tenant.status='active'
  where invoice.id=p_invoice_id and invoice.tenant_id=p_tenant_id and invoice.company_id=p_company_id
    and invoice.customer_profile_id=p_customer_profile_id and invoice.status<>'draft'
  ) row_value;
$$;

create function public.p309_get_company_invoice(
  p_tenant_id uuid,p_company_id uuid,p_actor_id uuid,p_invoice_id uuid
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_result jsonb;
begin
  perform private.p309_assert_pro_finance_scope(p_actor_id,p_tenant_id,p_company_id);
  select pg_catalog.to_jsonb(row_value) into v_result from (
    select invoice.*,invoice.amount_minor-coalesce((select pg_catalog.sum(allocation.amount_minor)::bigint
      from public.payment_allocations allocation where allocation.invoice_id=invoice.id),0::bigint) outstanding_minor,
      exists(select 1 from public.finance_receipt_snapshots receipt
        where receipt.tenant_id=invoice.tenant_id and receipt.company_id=invoice.company_id
          and receipt.invoice_id=invoice.id and receipt.receipt_kind='invoice'
          and receipt.receipt_id=invoice.id) receipt_available
    from public.invoices invoice where invoice.id=p_invoice_id
      and invoice.tenant_id=p_tenant_id and invoice.company_id=p_company_id
  ) row_value;
  return v_result;
end;
$$;

create function public.p309_list_customer_payment_history(p_customer_profile_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(row_value)
    order by row_value.created_at desc,row_value.id desc),'[]'::jsonb)
  from (
    select invoice.id,invoice.version,invoice.label,invoice.amount_minor,invoice.currency,
      invoice.status,invoice.due_at,invoice.paid_at,invoice.created_at,
      exists(select 1 from public.finance_receipt_snapshots receipt
        where receipt.tenant_id=invoice.tenant_id and receipt.company_id=invoice.company_id
          and receipt.invoice_id=invoice.id and receipt.receipt_kind='invoice'
          and receipt.receipt_id=invoice.id) receipt_available
    from public.invoices invoice
    join public.customer_profiles customer on customer.profile_id=p_customer_profile_id
      and customer.linked_company_id=invoice.company_id
    join public.profiles profile on profile.id=customer.profile_id and profile.tenant_id=invoice.tenant_id
      and profile.role='customer' and profile.status='active'
    join public.tenants tenant on tenant.id=invoice.tenant_id and tenant.status='active'
    where invoice.customer_profile_id=p_customer_profile_id and invoice.status<>'draft'
    order by invoice.created_at desc,invoice.id desc limit 100
  ) row_value;
$$;

create function private.p309_assert_admin_finance_scope(
  p_actor_id uuid,p_tenant_id uuid,p_company_id uuid
) returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists(select 1 from public.profiles profile where profile.id=p_actor_id
      and profile.role in ('admin','super_admin') and profile.status='active')
    or not exists(select 1 from public.tenants tenant join public.company_profiles company
      on company.tenant_id=tenant.id where tenant.id=p_tenant_id and company.id=p_company_id
      and tenant.status='active')
  then raise exception using errcode='42501',message='FORBIDDEN'; end if;
end;
$$;

create function public.p309_create_expense_draft(
  p_tenant_id uuid,p_company_id uuid,p_actor_id uuid,p_operation_id uuid,
  p_expected_version bigint,p_payload_hash text,p_source_reference text,p_description text,
  p_amount_minor bigint,p_currency text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb;v_id uuid:=gen_random_uuid();v_receipt uuid;v_result jsonb;
begin
  perform private.p309_assert_admin_finance_scope(p_actor_id,p_tenant_id,p_company_id);
  v_replay:=private.p309_command_replay(p_actor_id,p_tenant_id,p_company_id,p_operation_id,p_payload_hash);
  if v_replay is not null then return v_replay||'{"replayed":true}'::jsonb; end if;
  if p_expected_version<>0 or p_amount_minor not between 1 and 100000000000
    or pg_catalog.char_length(pg_catalog.btrim(p_source_reference)) not between 1 and 200
    or pg_catalog.char_length(pg_catalog.btrim(p_description)) not between 1 and 500
    or not exists(select 1 from public.finance_currencies currency where currency.code=p_currency)
  then raise exception using errcode='22023',message='VALIDATION_FAILED'; end if;
  v_result:=pg_catalog.jsonb_build_object('expenseId',v_id,'version',1,'state','draft','replayed',false);
  v_receipt:=private.p309_command_receipt(p_tenant_id,p_company_id,p_actor_id,p_operation_id,'expense',v_id,0,1,p_payload_hash,v_result);
  insert into public.finance_expenses(id,tenant_id,company_id,operation_receipt_id,source_reference,description,
    amount_minor,currency,created_by) values(v_id,p_tenant_id,p_company_id,v_receipt,pg_catalog.btrim(p_source_reference),
    pg_catalog.btrim(p_description),p_amount_minor,p_currency,p_actor_id);
  perform private.p309_command_audit(p_tenant_id,p_company_id,p_actor_id,v_receipt,'finance.expense_created','expense',v_id,'{}');
  return v_result;
end;
$$;

create function public.p309_approve_expense(
  p_tenant_id uuid,p_company_id uuid,p_actor_id uuid,p_operation_id uuid,
  p_expected_version bigint,p_payload_hash text,p_expense_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb;v_doc public.finance_expenses%rowtype;v_receipt uuid;v_version bigint;v_result jsonb;
begin
  perform private.p309_assert_admin_finance_scope(p_actor_id,p_tenant_id,p_company_id);
  v_replay:=private.p309_command_replay(p_actor_id,p_tenant_id,p_company_id,p_operation_id,p_payload_hash);
  if v_replay is not null then return v_replay||'{"replayed":true}'::jsonb; end if;
  select * into v_doc from public.finance_expenses where id=p_expense_id and tenant_id=p_tenant_id and company_id=p_company_id for update;
  if not found then raise exception using errcode='P0001',message='NOT_FOUND'; end if;
  perform private.p309_assert_expected_version(v_doc.version,p_expected_version);
  if v_doc.state<>'draft' then raise exception using errcode='23514',message='CONFLICT'; end if;
  update public.finance_expenses set state='approved',version=version+1,updated_at=pg_catalog.clock_timestamp()
    where id=p_expense_id returning version into v_version;
  v_result:=pg_catalog.jsonb_build_object('expenseId',p_expense_id,'version',v_version,'state','approved','replayed',false);
  v_receipt:=private.p309_command_receipt(p_tenant_id,p_company_id,p_actor_id,p_operation_id,'expense',p_expense_id,p_expected_version,v_version,p_payload_hash,v_result);
  perform private.p309_command_audit(p_tenant_id,p_company_id,p_actor_id,v_receipt,'finance.expense_approved','expense',p_expense_id,'{}');
  return v_result;
end;
$$;

create function public.p309_post_expense(
  p_tenant_id uuid,p_company_id uuid,p_actor_id uuid,p_operation_id uuid,
  p_expected_version bigint,p_payload_hash text,p_expense_id uuid,p_settlement_account text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb;v_doc public.finance_expenses%rowtype;v_receipt uuid;v_journal uuid:=gen_random_uuid();v_version bigint;v_result jsonb;
begin
  perform private.p309_assert_admin_finance_scope(p_actor_id,p_tenant_id,p_company_id);
  v_replay:=private.p309_command_replay(p_actor_id,p_tenant_id,p_company_id,p_operation_id,p_payload_hash);
  if v_replay is not null then return v_replay||'{"replayed":true}'::jsonb; end if;
  select * into v_doc from public.finance_expenses where id=p_expense_id and tenant_id=p_tenant_id and company_id=p_company_id for update;
  if not found then raise exception using errcode='P0001',message='NOT_FOUND'; end if;
  perform private.p309_assert_expected_version(v_doc.version,p_expected_version);
  if v_doc.state<>'approved' or p_settlement_account not in ('cash_clearing','bank_clearing')
  then raise exception using errcode='23514',message='CONFLICT'; end if;
  v_version:=v_doc.version+1;
  v_result:=pg_catalog.jsonb_build_object('expenseId',p_expense_id,'version',v_version,'state','posted','journalId',v_journal,'replayed',false);
  v_receipt:=private.p309_command_receipt(p_tenant_id,p_company_id,p_actor_id,p_operation_id,'expense',p_expense_id,p_expected_version,v_version,p_payload_hash,v_result);
  insert into public.finance_journals(id,tenant_id,company_id,operation_receipt_id,source_kind,source_id,currency,accounting_at)
    values(v_journal,p_tenant_id,p_company_id,v_receipt,'expense',p_expense_id,v_doc.currency,pg_catalog.clock_timestamp());
  insert into public.finance_journal_entries(journal_id,line_number,account_code,debit_minor,currency)
    values(v_journal,1,'expense',v_doc.amount_minor,v_doc.currency);
  insert into public.finance_journal_entries(journal_id,line_number,account_code,credit_minor,currency)
    values(v_journal,2,p_settlement_account,v_doc.amount_minor,v_doc.currency);
  perform private.p309_post_journal(v_journal);
  update public.finance_expenses set state='posted',version=v_version,posted_journal_id=v_journal,updated_at=pg_catalog.clock_timestamp() where id=p_expense_id;
  perform private.p309_command_audit(p_tenant_id,p_company_id,p_actor_id,v_receipt,'finance.expense_posted','expense',p_expense_id,pg_catalog.jsonb_build_object('journal_id',v_journal));
  perform private.p309_publish_event('finance.expense.posted',p_tenant_id,p_company_id,p_actor_id,p_operation_id,
    pg_catalog.jsonb_build_object('resource_id',p_expense_id,'operation_id',p_operation_id,'version',v_version,
      'state','posted','amount_minor',v_doc.amount_minor,'currency',v_doc.currency));
  return v_result;
end;
$$;

create function public.p309_create_compensation_draft(
  p_tenant_id uuid,p_company_id uuid,p_actor_id uuid,p_operation_id uuid,
  p_expected_version bigint,p_payload_hash text,p_pro_profile_id uuid,p_source_reference text,
  p_amount_minor bigint,p_currency text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb;v_id uuid:=gen_random_uuid();v_receipt uuid;v_result jsonb;
  v_assignment public.pro_company_assignments%rowtype;v_term public.pro_commercial_terms%rowtype;
begin
  perform private.p309_assert_admin_finance_scope(p_actor_id,p_tenant_id,p_company_id);
  v_replay:=private.p309_command_replay(p_actor_id,p_tenant_id,p_company_id,p_operation_id,p_payload_hash);
  if v_replay is not null then return v_replay||'{"replayed":true}'::jsonb; end if;
  select * into v_assignment from public.pro_company_assignments assignment where assignment.tenant_id=p_tenant_id
    and assignment.company_id=p_company_id and assignment.pro_profile_id=p_pro_profile_id and assignment.status='active' for update;
  select term.* into v_term from public.pro_assignment_term_links link
    join public.pro_commercial_terms term on term.id=link.compensation_term_id
      and term.pro_profile_id=p_pro_profile_id and term.term_kind='compensation'
    where link.assignment_id=v_assignment.id and term.status='active'
      and (pg_catalog.clock_timestamp() at time zone 'Asia/Dubai')::date between term.effective_from and coalesce(term.effective_to,'infinity'::date);
  if v_assignment.id is null or v_term.id is null then raise exception using errcode='42501',message='FORBIDDEN'; end if;
  if p_expected_version<>0 or p_amount_minor<>v_term.amount_minor then raise exception using errcode='23514',message='COMPENSATION_AMOUNT_CONFLICT'; end if;
  if p_currency<>v_term.currency then raise exception using errcode='23514',message='CURRENCY_MISMATCH'; end if;
  if pg_catalog.char_length(pg_catalog.btrim(p_source_reference)) not between 1 and 200
    then raise exception using errcode='22023',message='VALIDATION_FAILED'; end if;
  if exists(select 1 from public.pro_compensations compensation
    where compensation.tenant_id=p_tenant_id and compensation.company_id=p_company_id
      and compensation.pro_profile_id=p_pro_profile_id
      and compensation.company_assignment_id=v_assignment.id
      and compensation.commercial_term_id=v_term.id
      and compensation.source_reference_normalized=pg_catalog.lower(pg_catalog.btrim(p_source_reference)))
  then raise exception using errcode='23514',message='COMPENSATION_SOURCE_CONFLICT'; end if;
  v_result:=pg_catalog.jsonb_build_object('compensationId',v_id,'version',1,'state','draft','replayed',false);
  v_receipt:=private.p309_command_receipt(p_tenant_id,p_company_id,p_actor_id,p_operation_id,'compensation',v_id,0,1,p_payload_hash,v_result);
  insert into public.pro_compensations(id,tenant_id,company_id,pro_profile_id,company_assignment_id,company_assignment_assigned_at,
    commercial_term_id,commercial_term_version,commercial_term_model,commercial_term_amount_minor,commercial_term_scope,
    commercial_term_effective_from,operation_receipt_id,source_reference,amount_minor,currency,created_by)
    values(v_id,p_tenant_id,p_company_id,p_pro_profile_id,v_assignment.id,v_assignment.assigned_at,v_term.id,v_term.version,
      v_term.model,v_term.amount_minor,v_term.scope,v_term.effective_from,
      v_receipt,pg_catalog.lower(pg_catalog.btrim(p_source_reference)),p_amount_minor,p_currency,p_actor_id);
  perform private.p309_command_audit(p_tenant_id,p_company_id,p_actor_id,v_receipt,'finance.compensation_created','compensation',v_id,'{}');
  return v_result;
end;
$$;

create function public.p309_approve_compensation(
  p_tenant_id uuid,p_company_id uuid,p_actor_id uuid,p_operation_id uuid,
  p_expected_version bigint,p_payload_hash text,p_compensation_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb;v_doc public.pro_compensations%rowtype;v_receipt uuid;v_version bigint;v_result jsonb;
begin
  perform private.p309_assert_admin_finance_scope(p_actor_id,p_tenant_id,p_company_id);
  v_replay:=private.p309_command_replay(p_actor_id,p_tenant_id,p_company_id,p_operation_id,p_payload_hash);
  if v_replay is not null then return v_replay||'{"replayed":true}'::jsonb; end if;
  select * into v_doc from public.pro_compensations where id=p_compensation_id and tenant_id=p_tenant_id and company_id=p_company_id for update;
  if not found then raise exception using errcode='P0001',message='NOT_FOUND'; end if;
  perform private.p309_assert_expected_version(v_doc.version,p_expected_version);
  if v_doc.state<>'draft' then raise exception using errcode='23514',message='CONFLICT'; end if;
  update public.pro_compensations set state='approved',version=version+1,updated_at=pg_catalog.clock_timestamp()
    where id=p_compensation_id returning version into v_version;
  v_result:=pg_catalog.jsonb_build_object('compensationId',p_compensation_id,'version',v_version,'state','approved','replayed',false);
  v_receipt:=private.p309_command_receipt(p_tenant_id,p_company_id,p_actor_id,p_operation_id,'compensation',p_compensation_id,p_expected_version,v_version,p_payload_hash,v_result);
  perform private.p309_command_audit(p_tenant_id,p_company_id,p_actor_id,v_receipt,'finance.compensation_approved','compensation',p_compensation_id,'{}');
  return v_result;
end;
$$;

create function public.p309_post_compensation(
  p_tenant_id uuid,p_company_id uuid,p_actor_id uuid,p_operation_id uuid,
  p_expected_version bigint,p_payload_hash text,p_compensation_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb;v_doc public.pro_compensations%rowtype;v_receipt uuid;v_journal uuid:=gen_random_uuid();v_version bigint;v_result jsonb;
begin
  perform private.p309_assert_admin_finance_scope(p_actor_id,p_tenant_id,p_company_id);
  v_replay:=private.p309_command_replay(p_actor_id,p_tenant_id,p_company_id,p_operation_id,p_payload_hash);
  if v_replay is not null then return v_replay||'{"replayed":true}'::jsonb; end if;
  select * into v_doc from public.pro_compensations where id=p_compensation_id and tenant_id=p_tenant_id and company_id=p_company_id for update;
  if not found then raise exception using errcode='P0001',message='NOT_FOUND'; end if;
  perform private.p309_assert_expected_version(v_doc.version,p_expected_version);
  if v_doc.state<>'approved' then raise exception using errcode='23514',message='CONFLICT'; end if;
  v_version:=v_doc.version+1;
  v_result:=pg_catalog.jsonb_build_object('compensationId',p_compensation_id,'version',v_version,'state','posted','journalId',v_journal,'replayed',false);
  v_receipt:=private.p309_command_receipt(p_tenant_id,p_company_id,p_actor_id,p_operation_id,'compensation',p_compensation_id,p_expected_version,v_version,p_payload_hash,v_result);
  insert into public.finance_journals(id,tenant_id,company_id,operation_receipt_id,source_kind,source_id,currency,accounting_at)
    values(v_journal,p_tenant_id,p_company_id,v_receipt,'compensation',p_compensation_id,v_doc.currency,pg_catalog.clock_timestamp());
  insert into public.finance_journal_entries(journal_id,line_number,account_code,debit_minor,currency)
    values(v_journal,1,'expense',v_doc.amount_minor,v_doc.currency);
  insert into public.finance_journal_entries(journal_id,line_number,account_code,credit_minor,currency)
    values(v_journal,2,'pro_compensation_payable',v_doc.amount_minor,v_doc.currency);
  perform private.p309_post_journal(v_journal);
  update public.pro_compensations set state='posted',version=v_version,posted_journal_id=v_journal,updated_at=pg_catalog.clock_timestamp() where id=p_compensation_id;
  perform private.p309_command_audit(p_tenant_id,p_company_id,p_actor_id,v_receipt,'finance.compensation_posted','compensation',p_compensation_id,pg_catalog.jsonb_build_object('journal_id',v_journal));
  perform private.p309_publish_event('finance.compensation.posted',p_tenant_id,p_company_id,p_actor_id,p_operation_id,
    pg_catalog.jsonb_build_object('resource_id',p_compensation_id,'operation_id',p_operation_id,'version',v_version,
      'state','posted','amount_minor',v_doc.amount_minor,'currency',v_doc.currency));
  return v_result;
end;
$$;

create function public.p309_reverse_expense(
  p_tenant_id uuid,p_company_id uuid,p_actor_id uuid,p_operation_id uuid,
  p_expected_version bigint,p_payload_hash text,p_expense_id uuid,p_reason text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb;v_doc public.finance_expenses%rowtype;v_receipt uuid;v_version bigint;v_result jsonb;
  v_journal uuid:=gen_random_uuid();v_settlement text;
begin
  perform private.p309_assert_admin_finance_scope(p_actor_id,p_tenant_id,p_company_id);
  v_replay:=private.p309_command_replay(p_actor_id,p_tenant_id,p_company_id,p_operation_id,p_payload_hash);
  if v_replay is not null then return v_replay||'{"replayed":true}'::jsonb; end if;
  select * into v_doc from public.finance_expenses where id=p_expense_id and tenant_id=p_tenant_id and company_id=p_company_id for update;
  if not found then raise exception using errcode='P0001',message='NOT_FOUND'; end if;
  perform private.p309_assert_expected_version(v_doc.version,p_expected_version);
  if v_doc.state<>'posted' or pg_catalog.char_length(pg_catalog.btrim(p_reason)) not between 3 and 500
  then raise exception using errcode='23514',message='CONFLICT'; end if;
  select entry.account_code into v_settlement from public.finance_journal_entries entry
    where entry.journal_id=v_doc.posted_journal_id and entry.credit_minor>0
      and entry.account_code in ('cash_clearing','bank_clearing');
  if v_settlement is null then raise exception using errcode='23514',message='CONFLICT'; end if;
  v_version:=v_doc.version+1;
  v_result:=pg_catalog.jsonb_build_object('expenseId',p_expense_id,'version',v_version,'state','reversed','journalId',v_journal,'replayed',false);
  v_receipt:=private.p309_command_receipt(p_tenant_id,p_company_id,p_actor_id,p_operation_id,'expense',p_expense_id,p_expected_version,v_version,p_payload_hash,v_result);
  insert into public.finance_journals(id,tenant_id,company_id,operation_receipt_id,source_kind,source_id,currency,accounting_at)
    values(v_journal,p_tenant_id,p_company_id,v_receipt,'expense_reversal',p_expense_id,v_doc.currency,pg_catalog.clock_timestamp());
  insert into public.finance_journal_entries(journal_id,line_number,account_code,debit_minor,currency)
    values(v_journal,1,v_settlement,v_doc.amount_minor,v_doc.currency);
  insert into public.finance_journal_entries(journal_id,line_number,account_code,credit_minor,currency)
    values(v_journal,2,'expense',v_doc.amount_minor,v_doc.currency);
  perform private.p309_post_journal(v_journal);
  update public.finance_expenses set state='reversed',version=v_version,updated_at=pg_catalog.clock_timestamp() where id=p_expense_id;
  perform private.p309_command_audit(p_tenant_id,p_company_id,p_actor_id,v_receipt,'finance.expense_reversed','expense',p_expense_id,pg_catalog.jsonb_build_object('reason',pg_catalog.btrim(p_reason),'reverses_journal_id',v_doc.posted_journal_id));
  return v_result;
end;
$$;

create function public.p309_reverse_compensation(
  p_tenant_id uuid,p_company_id uuid,p_actor_id uuid,p_operation_id uuid,
  p_expected_version bigint,p_payload_hash text,p_compensation_id uuid,p_reason text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_replay jsonb;v_doc public.pro_compensations%rowtype;v_receipt uuid;v_version bigint;v_result jsonb;v_journal uuid:=gen_random_uuid();
begin
  perform private.p309_assert_admin_finance_scope(p_actor_id,p_tenant_id,p_company_id);
  v_replay:=private.p309_command_replay(p_actor_id,p_tenant_id,p_company_id,p_operation_id,p_payload_hash);
  if v_replay is not null then return v_replay||'{"replayed":true}'::jsonb; end if;
  select * into v_doc from public.pro_compensations where id=p_compensation_id and tenant_id=p_tenant_id and company_id=p_company_id for update;
  if not found then raise exception using errcode='P0001',message='NOT_FOUND'; end if;
  perform private.p309_assert_expected_version(v_doc.version,p_expected_version);
  if v_doc.state<>'posted' or pg_catalog.char_length(pg_catalog.btrim(p_reason)) not between 3 and 500
  then raise exception using errcode='23514',message='CONFLICT'; end if;
  v_version:=v_doc.version+1;
  v_result:=pg_catalog.jsonb_build_object('compensationId',p_compensation_id,'version',v_version,'state','reversed','journalId',v_journal,'replayed',false);
  v_receipt:=private.p309_command_receipt(p_tenant_id,p_company_id,p_actor_id,p_operation_id,'compensation',p_compensation_id,p_expected_version,v_version,p_payload_hash,v_result);
  insert into public.finance_journals(id,tenant_id,company_id,operation_receipt_id,source_kind,source_id,currency,accounting_at)
    values(v_journal,p_tenant_id,p_company_id,v_receipt,'compensation_reversal',p_compensation_id,v_doc.currency,pg_catalog.clock_timestamp());
  insert into public.finance_journal_entries(journal_id,line_number,account_code,debit_minor,currency)
    values(v_journal,1,'pro_compensation_payable',v_doc.amount_minor,v_doc.currency);
  insert into public.finance_journal_entries(journal_id,line_number,account_code,credit_minor,currency)
    values(v_journal,2,'expense',v_doc.amount_minor,v_doc.currency);
  perform private.p309_post_journal(v_journal);
  update public.pro_compensations set state='reversed',version=v_version,updated_at=pg_catalog.clock_timestamp() where id=p_compensation_id;
  perform private.p309_command_audit(p_tenant_id,p_company_id,p_actor_id,v_receipt,'finance.compensation_reversed','compensation',p_compensation_id,pg_catalog.jsonb_build_object('reason',pg_catalog.btrim(p_reason),'reverses_journal_id',v_doc.posted_journal_id));
  return v_result;
end;
$$;

create function public.p309_list_company_finance_costs(
  p_tenant_id uuid,p_company_id uuid,p_actor_id uuid,p_before_accounting_at timestamptz default null,
  p_before_id uuid default null,p_limit integer default 50
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_rows jsonb;v_total bigint;v_limit integer:=least(100,greatest(1,coalesce(p_limit,50)));
begin
  perform private.p309_assert_admin_finance_scope(p_actor_id,p_tenant_id,p_company_id);
  if (p_before_accounting_at is null)<>(p_before_id is null) then raise exception using errcode='22023',message='VALIDATION_FAILED'; end if;
  select count(*) into v_total from public.finance_journals journal where journal.tenant_id=p_tenant_id
    and journal.company_id=p_company_id and journal.state='posted'
    and journal.source_kind in ('expense','expense_reversal','compensation','compensation_reversal');
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('journalId',row_value.id,'sourceKind',row_value.source_kind,
    'sourceId',row_value.source_id,'amountMinor',row_value.amount_minor,'currency',row_value.currency,'accountingAt',row_value.accounting_at)
    order by row_value.accounting_at desc,row_value.id desc),'[]') into v_rows from (
      select journal.id,journal.source_kind,journal.source_id,journal.currency,journal.accounting_at,
        case when journal.source_kind in ('expense_reversal','compensation_reversal')
          then -pg_catalog.sum(entry.debit_minor)::bigint
          else pg_catalog.sum(entry.debit_minor)::bigint end amount_minor
      from public.finance_journals journal join public.finance_journal_entries entry on entry.journal_id=journal.id
      where journal.tenant_id=p_tenant_id and journal.company_id=p_company_id and journal.state='posted'
        and journal.source_kind in ('expense','expense_reversal','compensation','compensation_reversal')
        and (p_before_accounting_at is null or (journal.accounting_at,journal.id)<(p_before_accounting_at,p_before_id))
      group by journal.id order by journal.accounting_at desc,journal.id desc limit v_limit
    ) row_value;
  return pg_catalog.jsonb_build_object('rows',v_rows,'total',v_total,'limit',v_limit);
end;
$$;

create index invoices_p309_company_cursor_idx on public.invoices(tenant_id,company_id,created_at desc,id desc);
create index invoices_p309_customer_cursor_idx on public.invoices(tenant_id,company_id,customer_profile_id,created_at desc,id desc);

revoke all on function public.p309_create_invoice_draft(uuid,uuid,uuid,uuid,bigint,text,uuid,text,date,jsonb) from public, anon, authenticated;
grant execute on function public.p309_create_invoice_draft(uuid,uuid,uuid,uuid,bigint,text,uuid,text,date,jsonb) to service_role;
revoke all on function public.p309_finalize_invoice(uuid,uuid,uuid,uuid,bigint,text,uuid) from public, anon, authenticated;
grant execute on function public.p309_finalize_invoice(uuid,uuid,uuid,uuid,bigint,text,uuid) to service_role;
revoke all on function public.p309_allocate_manual_payment(uuid,uuid,uuid,uuid,bigint,text,uuid,bigint,text,text) from public, anon, authenticated;
grant execute on function public.p309_allocate_manual_payment(uuid,uuid,uuid,uuid,bigint,text,uuid,bigint,text,text) to service_role;
revoke all on function public.p309_void_invoice(uuid,uuid,uuid,uuid,bigint,text,uuid,text) from public, anon, authenticated;
grant execute on function public.p309_void_invoice(uuid,uuid,uuid,uuid,bigint,text,uuid,text) to service_role;
revoke all on function public.p309_prepare_refund(uuid,uuid,uuid,uuid,bigint,text,uuid,uuid,bigint,text) from public, anon, authenticated;
grant execute on function public.p309_prepare_refund(uuid,uuid,uuid,uuid,bigint,text,uuid,uuid,bigint,text) to service_role;
revoke all on function public.p309_attach_pending_refund(uuid,uuid,uuid,uuid,bigint,text,uuid,uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.p309_attach_pending_refund(uuid,uuid,uuid,uuid,bigint,text,uuid,uuid,uuid,text) to service_role;
revoke all on function public.p309_reconcile_refund(uuid,uuid,uuid,uuid,bigint,text,uuid,uuid,uuid,text,text) from public, anon, authenticated;
grant execute on function public.p309_reconcile_refund(uuid,uuid,uuid,uuid,bigint,text,uuid,uuid,uuid,text,text) to service_role;
revoke all on function public.p309_reconcile_pending_refund(uuid,text,text) from public, anon, authenticated;
grant execute on function public.p309_reconcile_pending_refund(uuid,text,text) to service_role;

revoke all on function public.create_company_invoice(uuid,uuid,uuid,text,text,text,bigint,text,date,uuid) from public,anon,authenticated,service_role;
revoke all on function public.prepare_company_refund(uuid,uuid,uuid,uuid,bigint,text,text) from public,anon,authenticated,service_role;
revoke all on function public.reconcile_company_refund(uuid,uuid,uuid,uuid,text,text,text) from public,anon,authenticated,service_role;
revoke all on function public.mark_company_invoice_paid(uuid,uuid,uuid,uuid,text,text,text) from public,anon,authenticated,service_role;
revoke all on function public.void_company_invoice(uuid,uuid,uuid,uuid,text,text) from public,anon,authenticated,service_role;
revoke all on function public.p309_list_company_invoices(uuid,uuid,uuid,timestamptz,uuid,integer,text,date,date,text) from public, anon, authenticated;
grant execute on function public.p309_list_company_invoices(uuid,uuid,uuid,timestamptz,uuid,integer,text,date,date,text) to service_role;
revoke all on function public.p309_list_customer_invoices(uuid,uuid,uuid,timestamptz,uuid,integer,text,date,uuid) from public, anon, authenticated;
grant execute on function public.p309_list_customer_invoices(uuid,uuid,uuid,timestamptz,uuid,integer,text,date,uuid) to service_role;
revoke all on function public.p309_get_customer_invoice(uuid,uuid,uuid,uuid) from public, anon, authenticated;
grant execute on function public.p309_get_customer_invoice(uuid,uuid,uuid,uuid) to service_role;
revoke all on function public.p309_get_company_invoice(uuid,uuid,uuid,uuid) from public, anon, authenticated;
grant execute on function public.p309_get_company_invoice(uuid,uuid,uuid,uuid) to service_role;
revoke all on function public.p309_list_customer_payment_history(uuid) from public, anon, authenticated;
grant execute on function public.p309_list_customer_payment_history(uuid) to service_role;
revoke all on function public.p309_create_expense_draft(uuid,uuid,uuid,uuid,bigint,text,text,text,bigint,text) from public, anon, authenticated;
grant execute on function public.p309_create_expense_draft(uuid,uuid,uuid,uuid,bigint,text,text,text,bigint,text) to service_role;
revoke all on function public.p309_approve_expense(uuid,uuid,uuid,uuid,bigint,text,uuid) from public, anon, authenticated;
grant execute on function public.p309_approve_expense(uuid,uuid,uuid,uuid,bigint,text,uuid) to service_role;
revoke all on function public.p309_post_expense(uuid,uuid,uuid,uuid,bigint,text,uuid,text) from public, anon, authenticated;
grant execute on function public.p309_post_expense(uuid,uuid,uuid,uuid,bigint,text,uuid,text) to service_role;
revoke all on function public.p309_reverse_expense(uuid,uuid,uuid,uuid,bigint,text,uuid,text) from public, anon, authenticated;
grant execute on function public.p309_reverse_expense(uuid,uuid,uuid,uuid,bigint,text,uuid,text) to service_role;
revoke all on function public.p309_create_compensation_draft(uuid,uuid,uuid,uuid,bigint,text,uuid,text,bigint,text) from public, anon, authenticated;
grant execute on function public.p309_create_compensation_draft(uuid,uuid,uuid,uuid,bigint,text,uuid,text,bigint,text) to service_role;
revoke all on function public.p309_approve_compensation(uuid,uuid,uuid,uuid,bigint,text,uuid) from public, anon, authenticated;
grant execute on function public.p309_approve_compensation(uuid,uuid,uuid,uuid,bigint,text,uuid) to service_role;
revoke all on function public.p309_post_compensation(uuid,uuid,uuid,uuid,bigint,text,uuid) from public, anon, authenticated;
grant execute on function public.p309_post_compensation(uuid,uuid,uuid,uuid,bigint,text,uuid) to service_role;
revoke all on function public.p309_reverse_compensation(uuid,uuid,uuid,uuid,bigint,text,uuid,text) from public, anon, authenticated;
grant execute on function public.p309_reverse_compensation(uuid,uuid,uuid,uuid,bigint,text,uuid,text) to service_role;
revoke all on function public.p309_list_company_finance_costs(uuid,uuid,uuid,timestamptz,uuid,integer) from public, anon, authenticated;
grant execute on function public.p309_list_company_finance_costs(uuid,uuid,uuid,timestamptz,uuid,integer) to service_role;

revoke all on function private.p309_assert_pro_finance_scope(uuid,uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function private.p309_assert_admin_finance_scope(uuid,uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function private.p309_command_replay(uuid,uuid,uuid,uuid,text) from public,anon,authenticated,service_role;
revoke all on function private.p309_command_receipt(uuid,uuid,uuid,uuid,text,uuid,bigint,bigint,text,jsonb) from public,anon,authenticated,service_role;
revoke all on function private.p309_command_audit(uuid,uuid,uuid,uuid,text,text,uuid,jsonb) from public,anon,authenticated,service_role;
revoke all on function private.p309_capture_receipt_snapshot(uuid,text,uuid,uuid,uuid,text,text) from public,anon,authenticated,service_role;
revoke all on function private.p309_event_uuid(text) from public,anon,authenticated,service_role;
revoke all on function private.p309_publish_event(text,uuid,uuid,uuid,uuid,jsonb) from public,anon,authenticated,service_role;
revoke all on function private.p309_reconcile_refund_core(uuid,uuid,uuid,uuid,bigint,text,uuid,uuid,uuid,text,text,boolean) from public,anon,authenticated,service_role;

commit;
