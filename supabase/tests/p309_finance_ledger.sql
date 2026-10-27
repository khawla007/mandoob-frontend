\set ON_ERROR_STOP on
set statement_timeout = '30s';
begin;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('93900000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'p309-admin@example.invalid', 'synthetic',
  '{}', '{}', pg_catalog.now(), pg_catalog.now());
insert into public.profiles (id, role, status, full_name)
values ('93900000-0000-4000-8000-000000000001', 'admin', 'active', 'P309 Test Admin');
insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('93900000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'p309-customer@example.invalid', 'synthetic',
   '{}', '{}', pg_catalog.now(), pg_catalog.now()),
  ('93900000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'p309-pro@example.invalid', 'synthetic',
   '{}', '{}', pg_catalog.now(), pg_catalog.now());
insert into public.tenants (id, slug, name, status) values
  ('93900000-0000-4000-8000-000000000010', 'p309-ledger-one', 'P309 Ledger One', 'active'),
  ('93900000-0000-4000-8000-000000000011', 'p309-ledger-two', 'P309 Ledger Two', 'active');
insert into public.company_profiles (id, tenant_id, company_name) values
  ('93900000-0000-4000-8000-000000000020', '93900000-0000-4000-8000-000000000010', 'P309 Company One'),
  ('93900000-0000-4000-8000-000000000021', '93900000-0000-4000-8000-000000000011', 'P309 Company Two');
insert into public.profiles (id, tenant_id, role, status, full_name) values
  ('93900000-0000-4000-8000-000000000002', '93900000-0000-4000-8000-000000000010', 'customer', 'active', 'P309 Customer'),
  ('93900000-0000-4000-8000-000000000003', '93900000-0000-4000-8000-000000000010', 'pro', 'active', 'P309 PRO');
insert into public.customer_profiles (profile_id, linked_company_id)
values ('93900000-0000-4000-8000-000000000002', '93900000-0000-4000-8000-000000000020');
insert into public.pro_profiles (profile_id)
values ('93900000-0000-4000-8000-000000000003');
insert into public.pro_company_assignments (
  id, tenant_id, company_id, pro_profile_id, assigned_at, assigned_by
) values (
  '93900000-0000-4000-8000-000000000095', '93900000-0000-4000-8000-000000000010',
  '93900000-0000-4000-8000-000000000020', '93900000-0000-4000-8000-000000000003',
  '2026-09-22 00:00:00+00', '93900000-0000-4000-8000-000000000001'
);
insert into public.pro_commercial_terms (
  id, pro_profile_id, term_kind, model, currency, amount_minor, scope,
  effective_from, status, version, created_by
) values
(
  '93900000-0000-4000-8000-000000000090', '93900000-0000-4000-8000-000000000003',
  'compensation', 'per_registration', 'AED', 10, 'all_registrations', current_date, 'active', 1,
  '93900000-0000-4000-8000-000000000001'
),
(
  '93900000-0000-4000-8000-000000000091', '93900000-0000-4000-8000-000000000003',
  'pricing', 'per_registration', 'AED', 20, 'all_registrations', current_date, 'active', 1,
  '93900000-0000-4000-8000-000000000001'
);
insert into public.pro_assignment_term_links (
  assignment_id, pricing_term_id, compensation_term_id, linked_by
) values (
  '93900000-0000-4000-8000-000000000095',
  '93900000-0000-4000-8000-000000000091',
  '93900000-0000-4000-8000-000000000090',
  '93900000-0000-4000-8000-000000000001'
);
insert into public.invoices (id, tenant_id, company_id, label, amount_minor, currency, status, ledger_eligible) values
  ('93900000-0000-4000-8000-000000000030', '93900000-0000-4000-8000-000000000010',
   '93900000-0000-4000-8000-000000000020', 'Legacy invoice', 100, 'AED', 'open', false),
  ('93900000-0000-4000-8000-000000000031', '93900000-0000-4000-8000-000000000010',
   '93900000-0000-4000-8000-000000000020', 'P309 invoice', 105, 'AED', 'draft', true);
insert into public.finance_operation_receipts (
  id, tenant_id, company_id, actor_id, operation_id, aggregate_kind, aggregate_id,
  expected_version, committed_version, payload_hash, sanitized_result
) values
  ('93900000-0000-4000-8000-000000000040', '93900000-0000-4000-8000-000000000010',
   '93900000-0000-4000-8000-000000000020', '93900000-0000-4000-8000-000000000001',
   '93900000-0000-4000-8000-000000000041', 'invoice', '93900000-0000-4000-8000-000000000031',
   0, 1, repeat('a', 64), '{"code":"ok"}'),
  ('93900000-0000-4000-8000-000000000042', '93900000-0000-4000-8000-000000000010',
   '93900000-0000-4000-8000-000000000020', '93900000-0000-4000-8000-000000000001',
   '93900000-0000-4000-8000-000000000043', 'payment', '93900000-0000-4000-8000-000000000050',
   1, 2, repeat('b', 64), '{"code":"ok"}'),
  ('93900000-0000-4000-8000-000000000044', '93900000-0000-4000-8000-000000000010',
   '93900000-0000-4000-8000-000000000020', '93900000-0000-4000-8000-000000000001',
   '93900000-0000-4000-8000-000000000045', 'refund', '93900000-0000-4000-8000-000000000060',
   2, 3, repeat('c', 64), '{"code":"ok"}'),
  ('93900000-0000-4000-8000-000000000046', '93900000-0000-4000-8000-000000000010',
   '93900000-0000-4000-8000-000000000020', '93900000-0000-4000-8000-000000000001',
   '93900000-0000-4000-8000-000000000047', 'credit_note', '93900000-0000-4000-8000-000000000071',
   3, 4, repeat('d', 64), '{"code":"ok"}'),
  ('93900000-0000-4000-8000-000000000048', '93900000-0000-4000-8000-000000000010',
   '93900000-0000-4000-8000-000000000020', '93900000-0000-4000-8000-000000000001',
   '93900000-0000-4000-8000-000000000049', 'expense', '93900000-0000-4000-8000-000000000091',
   0, 1, repeat('e', 64), '{"code":"ok"}'),
  ('93900000-0000-4000-8000-00000000004a', '93900000-0000-4000-8000-000000000010',
   '93900000-0000-4000-8000-000000000020', '93900000-0000-4000-8000-000000000001',
   '93900000-0000-4000-8000-00000000004b', 'compensation', '93900000-0000-4000-8000-000000000092',
   0, 1, repeat('f', 64), '{"code":"ok"}');

do $p309_customer_chain_contract$
begin
  begin
    insert into public.invoices (
      tenant_id, company_id, customer_profile_id, label, amount_minor, currency, status, ledger_eligible
    ) values (
      '93900000-0000-4000-8000-000000000011', '93900000-0000-4000-8000-000000000021',
      '93900000-0000-4000-8000-000000000002', 'Cross-company customer', 10, 'AED', 'draft', true
    );
    raise exception 'CUSTOMER_CHAIN_ACCEPTED';
  exception when check_violation then null; when foreign_key_violation then null; end;
end;
$p309_customer_chain_contract$;

do $p309_money_contract$
declare v_net bigint; v_vat bigint; v_total bigint; v_basis text;
begin
  if has_table_privilege('authenticated', 'public.invoice_lines', 'INSERT')
    or has_table_privilege('service_role', 'public.finance_journals', 'INSERT')
  then raise exception 'DIRECT_WRITE_NOT_REVOKED'; end if;
  if not has_table_privilege('service_role', 'public.invoices', 'INSERT')
    or not has_table_privilege('service_role', 'public.payments', 'INSERT')
    or not has_table_privilege('service_role', 'public.refunds', 'INSERT')
  then raise exception 'LEGACY_SERVICE_ROLE_WRITER_REVOKED'; end if;
  begin
    perform private.p309_checked_money(100000000001, 'AED');
    raise exception 'MONEY_LIMIT_NOT_ENFORCED';
  exception when numeric_value_out_of_range then null; end;
  select net_minor, vat_minor, total_minor into v_net, v_vat, v_total
  from private.p309_line_amounts(1, 105, 0, 'inclusive', 500);
  if (v_net, v_vat, v_total) is distinct from (100::bigint, 5::bigint, 105::bigint)
  then raise exception 'VAT_ROUNDING_MISMATCH'; end if;
  select net_minor, vat_minor, total_minor into v_net, v_vat, v_total
  from private.p309_line_amounts(2, 100, 20, 'exclusive', 500);
  if (v_net, v_vat, v_total) is distinct from (180::bigint, 9::bigint, 189::bigint)
  then raise exception 'EXCLUSIVE_VAT_MISMATCH'; end if;
  foreach v_basis in array array['exempt', 'zero_rated'] loop
    select net_minor, vat_minor, total_minor into v_net, v_vat, v_total
    from private.p309_line_amounts(1, 100, 0, v_basis, 0);
    if v_vat <> 0 then raise exception 'ZERO_VAT_BASIS_MISMATCH'; end if;
  end loop;
  begin
    perform private.p309_line_amounts(1, 100, 0, 'exclusive', 499);
    raise exception 'STANDARD_VAT_RATE_MISMATCH_ACCEPTED';
  exception when check_violation then null; end;
  begin
    perform private.p309_line_amounts(1, 100, 101, 'exclusive', 500);
    raise exception 'DISCOUNT_EXCEEDS_BASE_ACCEPTED';
  exception when check_violation then null; end;
  if not exists (select 1 from public.invoices where id = '93900000-0000-4000-8000-000000000030' and not ledger_eligible)
  then raise exception 'LEGACY_INVOICE_POSTABLE'; end if;
end;
$p309_money_contract$;

do $p309_line_journal_contract$
begin
  perform 'P309_TASK12_CONCURRENCY_CONTRACT';
  begin
    insert into public.invoice_lines (tenant_id, company_id, invoice_id, line_number, description,
      quantity, unit_amount_minor, discount_minor, tax_category, tax_basis, vat_basis_points,
      net_minor, vat_minor, total_minor, currency)
    values ('93900000-0000-4000-8000-000000000011', '93900000-0000-4000-8000-000000000021',
      '93900000-0000-4000-8000-000000000031', 1, 'Wrong company', 1, 105, 0,
      'standard', 'inclusive', 500, 100, 5, 105, 'AED');
    raise exception 'CROSS_COMPANY_INVOICE_LINE_ACCEPTED';
  exception when object_not_in_prerequisite_state then null; when foreign_key_violation then null; end;
  begin
    insert into public.invoice_lines (tenant_id, company_id, invoice_id, line_number, description,
      quantity, unit_amount_minor, discount_minor, tax_category, tax_basis, vat_basis_points,
      net_minor, vat_minor, total_minor, currency)
    values ('93900000-0000-4000-8000-000000000010', '93900000-0000-4000-8000-000000000020',
      '93900000-0000-4000-8000-000000000031', 1, 'Cross-currency line', 1, 105, 0,
      'standard', 'inclusive', 500, 100, 5, 105, 'USD');
    raise exception 'CROSS_CURRENCY_INVOICE_LINE_ACCEPTED';
  exception when object_not_in_prerequisite_state then null; end;
  begin
    insert into public.invoice_lines (tenant_id, company_id, invoice_id, line_number, description,
      quantity, unit_amount_minor, discount_minor, tax_category, tax_basis, vat_basis_points,
      net_minor, vat_minor, total_minor, currency)
    values ('93900000-0000-4000-8000-000000000010', '93900000-0000-4000-8000-000000000020',
      '93900000-0000-4000-8000-000000000031', 1, 'Forged inclusive VAT', 1, 105, 0,
      'standard', 'inclusive', 500, 99, 6, 105, 'AED');
    raise exception 'FORGED_INCLUSIVE_VAT_ACCEPTED';
  exception when check_violation then null; end;
  begin
    insert into public.invoice_lines (tenant_id, company_id, invoice_id, line_number, description,
      quantity, unit_amount_minor, discount_minor, tax_category, tax_basis, vat_basis_points,
      net_minor, vat_minor, total_minor, currency)
    values ('93900000-0000-4000-8000-000000000010', '93900000-0000-4000-8000-000000000020',
      '93900000-0000-4000-8000-000000000031', 1, 'Forged exclusive VAT', 1, 100, 0,
      'standard', 'exclusive', 500, 100, 4, 104, 'AED');
    raise exception 'FORGED_EXCLUSIVE_VAT_ACCEPTED';
  exception when check_violation then null; end;
  begin
    insert into public.invoice_lines (tenant_id, company_id, invoice_id, line_number, description,
      quantity, unit_amount_minor, discount_minor, tax_category, tax_basis, vat_basis_points,
      net_minor, vat_minor, total_minor, currency)
    values ('93900000-0000-4000-8000-000000000010', '93900000-0000-4000-8000-000000000020',
      '93900000-0000-4000-8000-000000000031', 2, 'Wrong standard VAT rate', 1, 100, 0,
      'standard', 'exclusive', 499, 100, 5, 105, 'AED');
    raise exception 'STANDARD_LINE_VAT_RATE_MISMATCH_ACCEPTED';
  exception when check_violation then null; end;
  insert into public.invoice_lines (id, tenant_id, company_id, invoice_id, line_number, description,
    quantity, unit_amount_minor, discount_minor, tax_category, tax_basis, vat_basis_points,
    net_minor, vat_minor, total_minor, currency)
  values ('93900000-0000-4000-8000-000000000070', '93900000-0000-4000-8000-000000000010',
    '93900000-0000-4000-8000-000000000020', '93900000-0000-4000-8000-000000000031',
    1, 'Inclusive line', 1, 105, 0, 'standard', 'inclusive', 500, 100, 5, 105, 'AED');
  begin
    update public.invoice_lines set vat_minor = 6, total_minor = 106
    where id = '93900000-0000-4000-8000-000000000070';
    raise exception 'FORGED_VAT_UPDATE_ACCEPTED';
  exception when check_violation then
    if sqlerrm <> 'INVOICE_LINE_AMOUNTS_FORGED' then raise; end if;
  end;
  update public.invoices set status = 'open', finalized_at = pg_catalog.clock_timestamp(), version = 1
  where id = '93900000-0000-4000-8000-000000000031';
  begin
    update public.invoice_lines set description = 'Mutated' where id = '93900000-0000-4000-8000-000000000070';
    raise exception 'FINALIZED_LINE_MUTATED';
  exception when object_not_in_prerequisite_state then null; end;
  insert into public.finance_journals (id, tenant_id, company_id, operation_receipt_id,
    source_kind, source_id, currency, accounting_at)
  values ('93900000-0000-4000-8000-000000000080', '93900000-0000-4000-8000-000000000010',
    '93900000-0000-4000-8000-000000000020', '93900000-0000-4000-8000-000000000040',
    'invoice', '93900000-0000-4000-8000-000000000031', 'AED', pg_catalog.clock_timestamp());
  begin
    insert into public.finance_journal_entries (journal_id, line_number, account_code, debit_minor, currency)
    values ('93900000-0000-4000-8000-000000000080', 1, 'receivable', 105, 'USD');
    raise exception 'MIXED_CURRENCY_JOURNAL_ACCEPTED';
  exception when foreign_key_violation then null; end;
  insert into public.finance_journal_entries (journal_id, line_number, account_code, debit_minor, currency)
  values ('93900000-0000-4000-8000-000000000080', 1, 'receivable', 105, 'AED');
  insert into public.finance_journal_entries (journal_id, line_number, account_code, credit_minor, currency)
  values ('93900000-0000-4000-8000-000000000080', 2, 'service_revenue', 100, 'AED');
  begin
    perform private.p309_post_journal('93900000-0000-4000-8000-000000000080');
    raise exception 'UNBALANCED_JOURNAL_ACCEPTED';
  exception when check_violation then null; end;
  insert into public.finance_journal_entries (journal_id, line_number, account_code, credit_minor, currency)
  values ('93900000-0000-4000-8000-000000000080', 3, 'vat_payable', 5, 'AED');
  begin
    update public.finance_journals set state = 'posted', posted_at = pg_catalog.clock_timestamp()
    where id = '93900000-0000-4000-8000-000000000080';
    raise exception 'DIRECT_JOURNAL_POST_ACCEPTED';
  exception when object_not_in_prerequisite_state then null; end;
  perform private.p309_post_journal('93900000-0000-4000-8000-000000000080');
  -- P309_TASK12_CONCURRENCY_CONTRACT: the entry trigger takes the same parent-row
  -- FOR UPDATE lock as posting, then rechecks state after either session wins.
  begin
    insert into public.finance_journal_entries (journal_id, line_number, account_code, debit_minor, currency)
    values ('93900000-0000-4000-8000-000000000080', 4, 'receivable', 1, 'AED');
    raise exception 'LATE_JOURNAL_ENTRY_ACCEPTED';
  exception when object_not_in_prerequisite_state then null; end;
  begin
    update public.finance_journals set accounting_at = pg_catalog.clock_timestamp()
    where id = '93900000-0000-4000-8000-000000000080';
    raise exception 'POSTED_JOURNAL_UPDATE_ACCEPTED';
  exception when object_not_in_prerequisite_state then null; end;
  begin
    delete from public.finance_journals where id = '93900000-0000-4000-8000-000000000080';
    raise exception 'POSTED_JOURNAL_DELETE_ACCEPTED';
  exception when object_not_in_prerequisite_state then null; end;
  insert into public.finance_journals (id, tenant_id, company_id, operation_receipt_id,
    source_kind, source_id, currency, accounting_at)
  values ('93900000-0000-4000-8000-000000000087', '93900000-0000-4000-8000-000000000010',
    '93900000-0000-4000-8000-000000000020', '93900000-0000-4000-8000-000000000040',
    'subscription_invoice', '93900000-0000-4000-8000-000000000031', 'AED', pg_catalog.now());
  insert into public.finance_journal_entries (journal_id, line_number, account_code, debit_minor, currency)
  values ('93900000-0000-4000-8000-000000000087', 1, 'receivable', 105, 'AED');
  insert into public.finance_journal_entries (journal_id, line_number, account_code, credit_minor, currency) values
    ('93900000-0000-4000-8000-000000000087', 2, 'subscription_revenue', 100, 'AED'),
    ('93900000-0000-4000-8000-000000000087', 3, 'vat_payable', 5, 'AED');
  begin
    perform private.p309_post_journal('93900000-0000-4000-8000-000000000087');
    raise exception 'DUPLICATE_SOURCE_POST_ACCEPTED';
  exception when unique_violation then null; end;
  insert into public.finance_journals (id, tenant_id, company_id, operation_receipt_id,
    source_kind, source_id, currency, accounting_at) values
    ('93900000-0000-4000-8000-000000000084', '93900000-0000-4000-8000-000000000010',
     '93900000-0000-4000-8000-000000000020', '93900000-0000-4000-8000-000000000040',
     'invoice', '93900000-0000-4000-8000-000000000031', 'AED', pg_catalog.now()),
    ('93900000-0000-4000-8000-000000000085', '93900000-0000-4000-8000-000000000010',
     '93900000-0000-4000-8000-000000000020', '93900000-0000-4000-8000-000000000040',
     'invoice', '93900000-0000-4000-8000-000000000031', 'AED', pg_catalog.now());
  insert into public.finance_journal_entries (journal_id, line_number, account_code, debit_minor, currency) values
    ('93900000-0000-4000-8000-000000000084', 1, 'receivable', 104, 'AED'),
    ('93900000-0000-4000-8000-000000000085', 1, 'expense', 105, 'AED');
  insert into public.finance_journal_entries (journal_id, line_number, account_code, credit_minor, currency) values
    ('93900000-0000-4000-8000-000000000084', 2, 'service_revenue', 104, 'AED'),
    ('93900000-0000-4000-8000-000000000085', 2, 'cash_clearing', 105, 'AED');
  begin
    perform private.p309_post_journal('93900000-0000-4000-8000-000000000084');
    raise exception 'JOURNAL_SOURCE_AMOUNT_MISMATCH_ACCEPTED';
  exception when check_violation then null; end;
  begin
    perform private.p309_post_journal('93900000-0000-4000-8000-000000000085');
    raise exception 'JOURNAL_SOURCE_ACCOUNTS_MISMATCH_ACCEPTED';
  exception when check_violation then null; end;
end;
$p309_line_journal_contract$;

do $p309_allocation_replay_rollback_contract$
begin
  begin
    insert into public.finance_credit_notes (
      id, tenant_id, company_id, invoice_id, operation_receipt_id, amount_minor, currency, reason
    ) values (
      '93900000-0000-4000-8000-000000000072', '93900000-0000-4000-8000-000000000010',
      '93900000-0000-4000-8000-000000000020', '93900000-0000-4000-8000-000000000031',
      '93900000-0000-4000-8000-000000000040', 1, 'AED', 'Wrong receipt'
    );
    raise exception 'CREDIT_RECEIPT_MISMATCH_ACCEPTED';
  exception when check_violation then null; end;
  insert into public.finance_credit_notes (
    id, tenant_id, company_id, invoice_id, operation_receipt_id, amount_minor, currency, reason
  ) values (
    '93900000-0000-4000-8000-000000000071', '93900000-0000-4000-8000-000000000010',
    '93900000-0000-4000-8000-000000000020', '93900000-0000-4000-8000-000000000031',
    '93900000-0000-4000-8000-000000000046', 30, 'AED', 'Approved credit'
  );
  begin
    insert into public.finance_credit_notes (
      tenant_id, company_id, invoice_id, operation_receipt_id, amount_minor, currency, reason
    ) values (
      '93900000-0000-4000-8000-000000000010', '93900000-0000-4000-8000-000000000020',
      '93900000-0000-4000-8000-000000000031', '93900000-0000-4000-8000-000000000046',
      80, 'AED', 'Excess credit'
    );
    raise exception 'CREDIT_NOTE_CEILING_ACCEPTED';
  exception when check_violation then null; end;
  begin
    update public.finance_credit_notes set reason = 'Mutated credit'
    where id = '93900000-0000-4000-8000-000000000071';
    raise exception 'CREDIT_NOTE_MUTATION_ACCEPTED';
  exception when object_not_in_prerequisite_state then null; end;
  insert into public.payments (id, tenant_id, invoice_id, provider, amount_minor, currency, method, status, received_at)
  values ('93900000-0000-4000-8000-000000000050', '93900000-0000-4000-8000-000000000010',
    '93900000-0000-4000-8000-000000000031', 'manual', 105, 'AED', 'cash', 'succeeded', pg_catalog.now());
  insert into public.payment_allocations (id, tenant_id, company_id, invoice_id, payment_id,
    operation_receipt_id, amount_minor, currency)
  values ('93900000-0000-4000-8000-000000000051', '93900000-0000-4000-8000-000000000010',
    '93900000-0000-4000-8000-000000000020', '93900000-0000-4000-8000-000000000031',
    '93900000-0000-4000-8000-000000000050', '93900000-0000-4000-8000-000000000042', 60, 'AED');
  begin
    insert into public.payment_allocations (tenant_id, company_id, invoice_id, payment_id,
      operation_receipt_id, amount_minor, currency)
    values ('93900000-0000-4000-8000-000000000010', '93900000-0000-4000-8000-000000000020',
      '93900000-0000-4000-8000-000000000031', '93900000-0000-4000-8000-000000000050',
      '93900000-0000-4000-8000-000000000040', 1, 'AED');
    raise exception 'ALLOCATION_RECEIPT_MISMATCH_ACCEPTED';
  exception when check_violation then null; end;
  begin
    insert into public.payment_allocations (tenant_id, company_id, invoice_id, payment_id,
      operation_receipt_id, amount_minor, currency)
    values ('93900000-0000-4000-8000-000000000010', '93900000-0000-4000-8000-000000000020',
      '93900000-0000-4000-8000-000000000031', '93900000-0000-4000-8000-000000000050',
      '93900000-0000-4000-8000-000000000042', 20, 'AED');
    raise exception 'CREDIT_DID_NOT_REDUCE_RECEIVABLE';
  exception when check_violation then null; end;
  begin
    insert into public.payment_allocations (tenant_id, company_id, invoice_id, payment_id,
      operation_receipt_id, amount_minor, currency)
    values ('93900000-0000-4000-8000-000000000010', '93900000-0000-4000-8000-000000000020',
      '93900000-0000-4000-8000-000000000031', '93900000-0000-4000-8000-000000000050',
      '93900000-0000-4000-8000-000000000042', 50, 'AED');
    raise exception 'OVERPAYMENT_ACCEPTED';
  exception when check_violation then null; end;
  insert into public.refunds (
    id, tenant_id, payment_id, amount_minor, currency, status, ledger_eligible, quarantine_reason
  )
  values ('93900000-0000-4000-8000-000000000060', '93900000-0000-4000-8000-000000000010',
    '93900000-0000-4000-8000-000000000050', 70, 'AED', 'succeeded', true, null);
  if not exists (
    select 1 from public.refunds
    where id = '93900000-0000-4000-8000-000000000060'
      and ledger_eligible and currency = 'AED' and quarantine_reason is null
  ) then raise exception 'VALID_LEGACY_REFUND_NOT_PRESERVED'; end if;
  insert into public.refunds (
    id, tenant_id, payment_id, amount_minor, status, ledger_eligible, quarantine_reason
  ) values (
    '93900000-0000-4000-8000-000000000061', '93900000-0000-4000-8000-000000000010',
    '93900000-0000-4000-8000-000000000050', 10, 'succeeded', false, 'legacy_currency_mismatch'
  );
  if not exists (
    select 1 from public.refunds
    where id = '93900000-0000-4000-8000-000000000061'
      and not ledger_eligible and currency is null and quarantine_reason = 'legacy_currency_mismatch'
  ) then raise exception 'INVALID_LEGACY_REFUND_NOT_PRESERVED'; end if;
  begin
    insert into public.finance_journals (
      id, tenant_id, company_id, operation_receipt_id, source_kind, source_id, currency, accounting_at
    ) values (
      '93900000-0000-4000-8000-000000000086', '93900000-0000-4000-8000-000000000010',
      '93900000-0000-4000-8000-000000000020', '93900000-0000-4000-8000-000000000044',
      'cash_refund', '93900000-0000-4000-8000-000000000061', 'AED', pg_catalog.clock_timestamp()
    );
    raise exception 'JOURNAL_RECEIPT_MISMATCH_ACCEPTED';
  exception when check_violation then null; end;
  insert into public.finance_operation_receipts (
    id, tenant_id, company_id, actor_id, operation_id, aggregate_kind, aggregate_id,
    expected_version, committed_version, payload_hash, sanitized_result
  ) values (
    '93900000-0000-4000-8000-00000000004c', '93900000-0000-4000-8000-000000000010',
    '93900000-0000-4000-8000-000000000020', '93900000-0000-4000-8000-000000000001',
    '93900000-0000-4000-8000-00000000004d', 'refund', '93900000-0000-4000-8000-000000000061',
    0, 1, repeat('1', 64), '{"code":"quarantined"}'
  );
  insert into public.finance_journals (
    id, tenant_id, company_id, operation_receipt_id, source_kind, source_id, currency, accounting_at
  ) values (
    '93900000-0000-4000-8000-000000000083', '93900000-0000-4000-8000-000000000010',
    '93900000-0000-4000-8000-000000000020', '93900000-0000-4000-8000-00000000004c',
    'cash_refund', '93900000-0000-4000-8000-000000000061', 'AED', pg_catalog.clock_timestamp()
  );
  insert into public.finance_journal_entries (
    journal_id, line_number, account_code, debit_minor, credit_minor, currency
  ) values
    ('93900000-0000-4000-8000-000000000083', 1, 'refund_contra_revenue', 1, 0, 'AED'),
    ('93900000-0000-4000-8000-000000000083', 2, 'cash_clearing', 0, 1, 'AED');
  begin
    perform private.p309_post_journal('93900000-0000-4000-8000-000000000083');
    raise exception 'QUARANTINED_REFUND_POSTING_ACCEPTED';
  exception when check_violation then null; end;
  begin
    insert into public.refund_allocations (tenant_id, company_id, invoice_id, payment_id, refund_id,
      payment_allocation_id, operation_receipt_id, amount_minor, currency)
    values ('93900000-0000-4000-8000-000000000010', '93900000-0000-4000-8000-000000000020',
      '93900000-0000-4000-8000-000000000031', '93900000-0000-4000-8000-000000000050',
      '93900000-0000-4000-8000-000000000060', '93900000-0000-4000-8000-000000000051',
      '93900000-0000-4000-8000-000000000042', 1, 'AED');
    raise exception 'REFUND_RECEIPT_MISMATCH_ACCEPTED';
  exception when check_violation then null; end;
  begin
    insert into public.refund_allocations (tenant_id, company_id, invoice_id, payment_id, refund_id,
      payment_allocation_id, operation_receipt_id, amount_minor, currency)
    values ('93900000-0000-4000-8000-000000000010', '93900000-0000-4000-8000-000000000020',
      '93900000-0000-4000-8000-000000000031', '93900000-0000-4000-8000-000000000050',
      '93900000-0000-4000-8000-000000000061', '93900000-0000-4000-8000-000000000051',
      '93900000-0000-4000-8000-00000000004c', 1, 'AED');
    raise exception 'QUARANTINED_REFUND_ALLOCATION_ACCEPTED';
  exception when check_violation then null; end;
  begin
    insert into public.refund_allocations (tenant_id, company_id, invoice_id, payment_id, refund_id,
      payment_allocation_id, operation_receipt_id, amount_minor, currency)
    values ('93900000-0000-4000-8000-000000000010', '93900000-0000-4000-8000-000000000020',
      '93900000-0000-4000-8000-000000000031', '93900000-0000-4000-8000-000000000050',
      '93900000-0000-4000-8000-000000000060', '93900000-0000-4000-8000-000000000051',
      '93900000-0000-4000-8000-000000000044', 70, 'AED');
    raise exception 'REFUND_EXCEEDS_CAPTURE_ACCEPTED';
  exception when check_violation then null; end;
  if private.p309_replay_receipt(
    '93900000-0000-4000-8000-000000000001', '93900000-0000-4000-8000-000000000041', repeat('a', 64)
  ) is distinct from '{"code":"ok"}'::jsonb then raise exception 'EXACT_REPLAY_CHANGED_RESULT'; end if;
  begin
    perform private.p309_replay_receipt(
      '93900000-0000-4000-8000-000000000001', '93900000-0000-4000-8000-000000000041', repeat('9', 64)
    );
    raise exception 'OPERATION_REPLAY_CONFLICT_ACCEPTED';
  exception when unique_violation then null; end;
  begin
    perform private.p309_assert_expected_version(1, 0);
    raise exception 'STALE_VERSION_ACCEPTED';
  exception when serialization_failure then null; end;
  update public.invoices set status = 'void', voided_at = pg_catalog.clock_timestamp(), version = 2
  where id = '93900000-0000-4000-8000-000000000031';
  insert into public.finance_journals (id, tenant_id, company_id, operation_receipt_id,
    source_kind, source_id, currency, accounting_at)
  values ('93900000-0000-4000-8000-000000000088', '93900000-0000-4000-8000-000000000010',
    '93900000-0000-4000-8000-000000000020', '93900000-0000-4000-8000-000000000040',
    'invoice_void', '93900000-0000-4000-8000-000000000031', 'AED', pg_catalog.now());
  insert into public.finance_journal_entries (journal_id, line_number, account_code, debit_minor, currency) values
    ('93900000-0000-4000-8000-000000000088', 1, 'service_revenue', 100, 'AED'),
    ('93900000-0000-4000-8000-000000000088', 2, 'vat_payable', 5, 'AED');
  insert into public.finance_journal_entries (journal_id, line_number, account_code, credit_minor, currency)
  values ('93900000-0000-4000-8000-000000000088', 3, 'receivable', 105, 'AED');
  perform private.p309_post_journal('93900000-0000-4000-8000-000000000088');
  if not exists (
    select 1 from public.finance_journals
    where id = '93900000-0000-4000-8000-000000000088' and state = 'posted'
  ) then raise exception 'INVOICE_REVERSAL_SOURCE_COLLIDED'; end if;
  begin
    insert into public.payment_allocations (tenant_id, company_id, invoice_id, payment_id,
      operation_receipt_id, amount_minor, currency)
    values ('93900000-0000-4000-8000-000000000010', '93900000-0000-4000-8000-000000000020',
      '93900000-0000-4000-8000-000000000031', '93900000-0000-4000-8000-000000000050',
      '93900000-0000-4000-8000-000000000042', 1, 'AED');
    raise exception 'VOID_PAYMENT_RACE_ACCEPTED';
  exception when check_violation then null; end;
  begin
    insert into public.finance_audit_log (tenant_id, company_id, actor_id, operation_receipt_id,
      action, resource_kind, resource_id)
    values ('93900000-0000-4000-8000-000000000010', '93900000-0000-4000-8000-000000000020',
      '93900000-0000-4000-8000-000000000001', '93900000-0000-4000-8000-000000000040',
      'finance.test', 'invoice', '93900000-0000-4000-8000-000000000031');
    raise exception 'FORCED_FINANCE_AUDIT_ROLLBACK';
  exception when raise_exception then
    if sqlerrm <> 'FORCED_FINANCE_AUDIT_ROLLBACK' then raise; end if;
  end;
  if exists (select 1 from public.finance_audit_log where action = 'finance.test')
  then raise exception 'FINANCE_AUDIT_ROLLBACK_NOT_ATOMIC'; end if;
end;
$p309_allocation_replay_rollback_contract$;

do $p309_expense_compensation_commands$
declare
  v_result jsonb;
  v_replay jsonb;
  v_expense_id uuid;
  v_compensation_id uuid;
  v_expense_journal_id uuid;
  v_compensation_journal_id uuid;
  v_costs jsonb;
begin
  v_result := public.p309_create_expense_draft(
    '93900000-0000-4000-8000-000000000010', '93900000-0000-4000-8000-000000000020',
    '93900000-0000-4000-8000-000000000001', '93900000-0000-4000-8000-000000000101',
    0, repeat('1', 64), 'supplier-invoice-1', 'Government disbursement', 10, 'AED'
  );
  v_expense_id := (v_result->>'expenseId')::uuid;
  if (v_result->>'state', (v_result->>'version')::bigint, (v_result->>'replayed')::boolean)
    is distinct from ('draft', 1::bigint, false)
  then raise exception 'EXPENSE_DRAFT_RECEIPT_INVALID'; end if;

  v_replay := public.p309_create_expense_draft(
    '93900000-0000-4000-8000-000000000010', '93900000-0000-4000-8000-000000000020',
    '93900000-0000-4000-8000-000000000001', '93900000-0000-4000-8000-000000000101',
    0, repeat('1', 64), 'supplier-invoice-1', 'Government disbursement', 10, 'AED'
  );
  if (v_replay->>'expenseId')::uuid <> v_expense_id or (v_replay->>'replayed')::boolean is not true
  then raise exception 'EXPENSE_REPLAY_NOT_EXACT'; end if;
  begin
    perform public.p309_create_expense_draft(
      '93900000-0000-4000-8000-000000000010', '93900000-0000-4000-8000-000000000020',
      '93900000-0000-4000-8000-000000000001', '93900000-0000-4000-8000-000000000101',
      0, repeat('2', 64), 'supplier-invoice-1', 'Changed payload', 10, 'AED'
    );
    raise exception 'EXPENSE_OPERATION_CONFLICT_ACCEPTED';
  exception when unique_violation then
    if sqlerrm <> 'OPERATION_REUSED' then raise; end if;
  end;
  begin
    perform public.p309_approve_expense(
      '93900000-0000-4000-8000-000000000010', '93900000-0000-4000-8000-000000000020',
      '93900000-0000-4000-8000-000000000001', '93900000-0000-4000-8000-000000000102',
      0, repeat('3', 64), v_expense_id
    );
    raise exception 'STALE_EXPENSE_APPROVAL_ACCEPTED';
  exception when serialization_failure then null; end;
  v_result := public.p309_approve_expense(
    '93900000-0000-4000-8000-000000000010', '93900000-0000-4000-8000-000000000020',
    '93900000-0000-4000-8000-000000000001', '93900000-0000-4000-8000-000000000103',
    1, repeat('4', 64), v_expense_id
  );
  if (v_result->>'state', (v_result->>'version')::bigint) is distinct from ('approved', 2::bigint)
  then raise exception 'EXPENSE_APPROVAL_INVALID'; end if;
  v_result := public.p309_post_expense(
    '93900000-0000-4000-8000-000000000010', '93900000-0000-4000-8000-000000000020',
    '93900000-0000-4000-8000-000000000001', '93900000-0000-4000-8000-000000000104',
    2, repeat('5', 64), v_expense_id, 'bank_clearing'
  );
  v_expense_journal_id := (v_result->>'journalId')::uuid;
  if (v_result->>'state', (v_result->>'version')::bigint) is distinct from ('posted', 3::bigint)
    or not exists (
      select 1 from public.finance_journals journal
      join public.finance_journal_entries debit on debit.journal_id = journal.id
        and debit.account_code = 'expense' and debit.debit_minor = 10
      join public.finance_journal_entries credit on credit.journal_id = journal.id
        and credit.account_code = 'bank_clearing' and credit.credit_minor = 10
      where journal.id = v_expense_journal_id and journal.state = 'posted'
    )
  then raise exception 'EXPENSE_POSTING_INVALID'; end if;
  begin
    update public.finance_expenses set amount_minor = 11 where id = v_expense_id;
    raise exception 'POSTED_EXPENSE_MUTABLE';
  exception when object_not_in_prerequisite_state then null; end;
  v_result := public.p309_reverse_expense(
    '93900000-0000-4000-8000-000000000010', '93900000-0000-4000-8000-000000000020',
    '93900000-0000-4000-8000-000000000001', '93900000-0000-4000-8000-000000000105',
    3, repeat('6', 64), v_expense_id, 'Supplier credit note received'
  );
  if (v_result->>'state', (v_result->>'version')::bigint) is distinct from ('reversed', 4::bigint)
    or not exists (
      select 1 from public.finance_journals journal
      join public.finance_journal_entries debit on debit.journal_id = journal.id
        and debit.account_code = 'bank_clearing' and debit.debit_minor = 10
      join public.finance_journal_entries credit on credit.journal_id = journal.id
        and credit.account_code = 'expense' and credit.credit_minor = 10
      where journal.id = (v_result->>'journalId')::uuid and journal.state = 'posted'
        and journal.source_kind = 'expense_reversal'
    )
  then raise exception 'EXPENSE_REVERSAL_INVALID'; end if;

  begin
    perform public.p309_create_compensation_draft(
      '93900000-0000-4000-8000-000000000010', '93900000-0000-4000-8000-000000000020',
      '93900000-0000-4000-8000-000000000001', '93900000-0000-4000-8000-000000000106',
      0, repeat('7', 64), '93900000-0000-4000-8000-000000000002', 'registration-wrong-pro', 10, 'AED'
    );
    raise exception 'WRONG_PRO_COMPENSATION_ACCEPTED';
  exception when insufficient_privilege then null; end;
  begin
    perform public.p309_create_compensation_draft(
      '93900000-0000-4000-8000-000000000010', '93900000-0000-4000-8000-000000000020',
      '93900000-0000-4000-8000-000000000001', '93900000-0000-4000-8000-000000000107',
      0, repeat('8', 64), '93900000-0000-4000-8000-000000000003', 'registration-wrong-amount', 11, 'AED'
    );
    raise exception 'COMPENSATION_AMOUNT_CONFLICT_ACCEPTED';
  exception when check_violation then
    if sqlerrm <> 'COMPENSATION_AMOUNT_CONFLICT' then raise; end if;
  end;
  begin
    perform public.p309_create_compensation_draft(
      '93900000-0000-4000-8000-000000000010', '93900000-0000-4000-8000-000000000020',
      '93900000-0000-4000-8000-000000000001', '93900000-0000-4000-8000-000000000108',
      0, repeat('9', 64), '93900000-0000-4000-8000-000000000003', 'registration-wrong-currency', 10, 'USD'
    );
    raise exception 'COMPENSATION_CURRENCY_CONFLICT_ACCEPTED';
  exception when check_violation then
    if sqlerrm <> 'CURRENCY_MISMATCH' then raise; end if;
  end;

  v_result := public.p309_create_compensation_draft(
    '93900000-0000-4000-8000-000000000010', '93900000-0000-4000-8000-000000000020',
    '93900000-0000-4000-8000-000000000001', '93900000-0000-4000-8000-000000000109',
    0, repeat('a', 64), '93900000-0000-4000-8000-000000000003', 'registration-1', 10, 'AED'
  );
  v_compensation_id := (v_result->>'compensationId')::uuid;
  v_replay := public.p309_create_compensation_draft(
    '93900000-0000-4000-8000-000000000010', '93900000-0000-4000-8000-000000000020',
    '93900000-0000-4000-8000-000000000001', '93900000-0000-4000-8000-000000000109',
    0, repeat('a', 64), '93900000-0000-4000-8000-000000000003', 'registration-1', 10, 'AED'
  );
  if (v_replay->>'compensationId')::uuid <> v_compensation_id
    or (v_replay->>'replayed')::boolean is not true
  then raise exception 'COMPENSATION_REPLAY_NOT_EXACT'; end if;
  begin
    perform public.p309_create_compensation_draft(
      '93900000-0000-4000-8000-000000000010', '93900000-0000-4000-8000-000000000020',
      '93900000-0000-4000-8000-000000000001', '93900000-0000-4000-8000-00000000010d',
      0, repeat('e', 64), '93900000-0000-4000-8000-000000000003', ' REGISTRATION-1 ', 10, 'AED'
    );
    raise exception 'DUPLICATE_COMPENSATION_SOURCE_ACCEPTED';
  exception when check_violation then
    if sqlerrm <> 'COMPENSATION_SOURCE_CONFLICT' then raise; end if;
  end;
  if not exists (
    select 1 from public.pro_compensations compensation
    where compensation.id = v_compensation_id
      and compensation.company_assignment_id = '93900000-0000-4000-8000-000000000095'
      and compensation.company_assignment_assigned_at = '2026-09-22 00:00:00+00'
      and compensation.commercial_term_id = '93900000-0000-4000-8000-000000000090'
      and compensation.commercial_term_version = 1
      and compensation.commercial_term_model = 'per_registration'
      and compensation.commercial_term_amount_minor = 10
      and compensation.commercial_term_scope = 'all_registrations'
      and compensation.commercial_term_effective_from = current_date
  ) then raise exception 'COMPENSATION_P303_SNAPSHOT_MISSING'; end if;
  v_result := public.p309_approve_compensation(
    '93900000-0000-4000-8000-000000000010', '93900000-0000-4000-8000-000000000020',
    '93900000-0000-4000-8000-000000000001', '93900000-0000-4000-8000-00000000010a',
    1, repeat('b', 64), v_compensation_id
  );
  v_result := public.p309_post_compensation(
    '93900000-0000-4000-8000-000000000010', '93900000-0000-4000-8000-000000000020',
    '93900000-0000-4000-8000-000000000001', '93900000-0000-4000-8000-00000000010b',
    2, repeat('c', 64), v_compensation_id
  );
  v_compensation_journal_id := (v_result->>'journalId')::uuid;
  if not exists (
    select 1 from public.finance_journals journal
    join public.finance_journal_entries debit on debit.journal_id = journal.id
      and debit.account_code = 'expense' and debit.debit_minor = 10
    join public.finance_journal_entries credit on credit.journal_id = journal.id
      and credit.account_code = 'pro_compensation_payable' and credit.credit_minor = 10
    where journal.id = v_compensation_journal_id and journal.state = 'posted'
  ) then raise exception 'COMPENSATION_POSTING_INVALID'; end if;
  begin
    update public.pro_compensations set amount_minor = 11 where id = v_compensation_id;
    raise exception 'POSTED_COMPENSATION_MUTABLE';
  exception when object_not_in_prerequisite_state then null; end;
  v_result := public.p309_reverse_compensation(
    '93900000-0000-4000-8000-000000000010', '93900000-0000-4000-8000-000000000020',
    '93900000-0000-4000-8000-000000000001', '93900000-0000-4000-8000-00000000010c',
    3, repeat('d', 64), v_compensation_id, 'Duplicate registration adjustment'
  );
  if not exists (
    select 1 from public.finance_journals journal
    join public.finance_journal_entries debit on debit.journal_id = journal.id
      and debit.account_code = 'pro_compensation_payable' and debit.debit_minor = 10
    join public.finance_journal_entries credit on credit.journal_id = journal.id
      and credit.account_code = 'expense' and credit.credit_minor = 10
    where journal.id = (v_result->>'journalId')::uuid and journal.state = 'posted'
      and journal.source_kind = 'compensation_reversal'
  ) then raise exception 'COMPENSATION_REVERSAL_INVALID'; end if;

  v_costs := public.p309_list_company_finance_costs(
    '93900000-0000-4000-8000-000000000010', '93900000-0000-4000-8000-000000000020',
    '93900000-0000-4000-8000-000000000001', null, null, 50
  );
  if (v_costs->>'total')::bigint <> 4
    or pg_catalog.jsonb_array_length(v_costs->'rows') <> 4
    or (select pg_catalog.sum((row_value->>'amountMinor')::bigint)
        from pg_catalog.jsonb_array_elements(v_costs->'rows') row_value) <> 0
    or exists (
      select 1 from pg_catalog.jsonb_array_elements(v_costs->'rows') row_value
      where row_value->>'sourceKind' not in (
        'expense', 'expense_reversal', 'compensation', 'compensation_reversal'
      )
    )
  then raise exception 'FINANCE_COST_READ_NOT_JOURNAL_DERIVED'; end if;
  if (select count(*) from public.finance_audit_log where resource_id in (v_expense_id, v_compensation_id)) <> 8
    or (select count(*) from public.domain_events where event_type in (
      'finance.expense.posted', 'finance.compensation.posted'
    ) and payload->>'resource_id' in (v_expense_id::text, v_compensation_id::text)) <> 2
  then raise exception 'EXPENSE_COMPENSATION_AUDIT_EVENT_MISSING'; end if;
end;
$p309_expense_compensation_commands$;

do $p309_event_identity_scope$
declare v_operation constant uuid := '93900000-0000-4000-8000-0000000001f0';
begin
  perform private.p309_publish_event('finance.expense.posted',
    '93900000-0000-4000-8000-000000000010','93900000-0000-4000-8000-000000000020',
    '93900000-0000-4000-8000-000000000001',v_operation,
    pg_catalog.jsonb_build_object('resource_id','93900000-0000-4000-8000-0000000001f1','operation_id',v_operation,
      'version',1,'state','posted','amount_minor',1,'currency','AED'));
  perform private.p309_publish_event('finance.expense.posted',
    '93900000-0000-4000-8000-000000000010','93900000-0000-4000-8000-000000000020',
    '93900000-0000-4000-8000-000000000003',v_operation,
    pg_catalog.jsonb_build_object('resource_id','93900000-0000-4000-8000-0000000001f2','operation_id',v_operation,
      'version',1,'state','posted','amount_minor',1,'currency','AED'));
  if (select count(*) from public.domain_events where event_type='finance.expense.posted'
      and correlation_id=v_operation and actor_id in (
        '93900000-0000-4000-8000-000000000001','93900000-0000-4000-8000-000000000003'))<>2
  then raise exception 'FINANCE_EVENT_IDENTITY_SCOPE_COLLISION'; end if;
end;
$p309_event_identity_scope$;

do $p309_expense_compensation_provenance$
begin
  begin
    insert into public.finance_expenses (id, tenant_id, company_id, operation_receipt_id,
      source_reference, description, amount_minor, currency, state, version, created_by)
    values ('93900000-0000-4000-8000-000000000091', '93900000-0000-4000-8000-000000000010',
      '93900000-0000-4000-8000-000000000020', '93900000-0000-4000-8000-000000000048',
      'invalid-expense', 'Invalid lifecycle', 10, 'AED', 'posted', 1,
      '93900000-0000-4000-8000-000000000001');
    raise exception 'INVALID_EXPENSE_LIFECYCLE_ACCEPTED';
  exception when check_violation then null; end;
  begin
    insert into public.pro_compensations (id, tenant_id, company_id, pro_profile_id,
      company_assignment_id, company_assignment_assigned_at,
      commercial_term_id, commercial_term_version, commercial_term_model,
      commercial_term_amount_minor, commercial_term_scope, commercial_term_effective_from,
      operation_receipt_id, source_reference,
      amount_minor, currency, state, version, created_by)
    values ('93900000-0000-4000-8000-000000000092', '93900000-0000-4000-8000-000000000010',
      '93900000-0000-4000-8000-000000000020', '93900000-0000-4000-8000-000000000003',
      '93900000-0000-4000-8000-000000000095', '2026-09-22 00:00:00+00',
      '93900000-0000-4000-8000-000000000090', 1, 'per_registration', 10,
      'all_registrations', current_date, '93900000-0000-4000-8000-00000000004a',
      'invalid-compensation', 10, 'AED', 'posted', 0,
      '93900000-0000-4000-8000-000000000001');
    raise exception 'INVALID_COMPENSATION_LIFECYCLE_ACCEPTED';
  exception when check_violation then null; end;
  begin
    insert into public.pro_compensations (id, tenant_id, company_id, pro_profile_id,
      company_assignment_id, company_assignment_assigned_at,
      commercial_term_id, commercial_term_version, commercial_term_model,
      commercial_term_amount_minor, commercial_term_scope, commercial_term_effective_from,
      operation_receipt_id, source_reference,
      amount_minor, currency, created_by)
    values ('93900000-0000-4000-8000-000000000092', '93900000-0000-4000-8000-000000000010',
      '93900000-0000-4000-8000-000000000020', '93900000-0000-4000-8000-000000000003',
      '93900000-0000-4000-8000-000000000095', '2026-09-23 00:00:00+00',
      '93900000-0000-4000-8000-000000000090', 1, 'per_registration', 10,
      'all_registrations', current_date, '93900000-0000-4000-8000-00000000004a',
      'wrong-assignment-snapshot', 10, 'AED', '93900000-0000-4000-8000-000000000001');
    raise exception 'COMPENSATION_ASSIGNMENT_PROVENANCE_ACCEPTED';
  exception when check_violation then null; when foreign_key_violation then null; end;
  insert into public.finance_expenses (id, tenant_id, company_id, operation_receipt_id,
    source_reference, description, amount_minor, currency, created_by)
  values ('93900000-0000-4000-8000-000000000091', '93900000-0000-4000-8000-000000000010',
    '93900000-0000-4000-8000-000000000020', '93900000-0000-4000-8000-000000000048',
    'expense-proof', 'Valid expense', 10, 'AED', '93900000-0000-4000-8000-000000000001');
  insert into public.pro_compensations (id, tenant_id, company_id, pro_profile_id,
    company_assignment_id, company_assignment_assigned_at,
    commercial_term_id, commercial_term_version, commercial_term_model,
    commercial_term_amount_minor, commercial_term_scope, commercial_term_effective_from,
    operation_receipt_id, source_reference,
    amount_minor, currency, created_by)
  values ('93900000-0000-4000-8000-000000000092', '93900000-0000-4000-8000-000000000010',
    '93900000-0000-4000-8000-000000000020', '93900000-0000-4000-8000-000000000003',
    '93900000-0000-4000-8000-000000000095', '2026-09-22 00:00:00+00',
    '93900000-0000-4000-8000-000000000090', 1, 'per_registration', 10,
    'all_registrations', current_date, '93900000-0000-4000-8000-00000000004a',
    'compensation-proof', 10, 'AED', '93900000-0000-4000-8000-000000000001');
  update public.finance_expenses set state = 'approved', version = 2, updated_at = pg_catalog.clock_timestamp()
  where id = '93900000-0000-4000-8000-000000000091';
  update public.pro_compensations set state = 'approved', version = 2, updated_at = pg_catalog.clock_timestamp()
  where id = '93900000-0000-4000-8000-000000000092';
  insert into public.finance_journals (id, tenant_id, company_id, operation_receipt_id,
    source_kind, source_id, currency, accounting_at) values
    ('93900000-0000-4000-8000-000000000081', '93900000-0000-4000-8000-000000000010',
     '93900000-0000-4000-8000-000000000020', '93900000-0000-4000-8000-000000000048',
     'expense', '93900000-0000-4000-8000-000000000091', 'AED', pg_catalog.now()),
    ('93900000-0000-4000-8000-000000000082', '93900000-0000-4000-8000-000000000010',
     '93900000-0000-4000-8000-000000000020', '93900000-0000-4000-8000-00000000004a',
     'compensation', '93900000-0000-4000-8000-000000000092', 'AED', pg_catalog.now());
  insert into public.finance_journal_entries (journal_id, line_number, account_code, debit_minor, currency) values
    ('93900000-0000-4000-8000-000000000081', 1, 'expense', 10, 'AED'),
    ('93900000-0000-4000-8000-000000000082', 1, 'expense', 10, 'AED');
  insert into public.finance_journal_entries (journal_id, line_number, account_code, credit_minor, currency) values
    ('93900000-0000-4000-8000-000000000081', 2, 'cash_clearing', 10, 'AED'),
    ('93900000-0000-4000-8000-000000000082', 2, 'pro_compensation_payable', 10, 'AED');
  perform private.p309_post_journal('93900000-0000-4000-8000-000000000081');
  perform private.p309_post_journal('93900000-0000-4000-8000-000000000082');
  begin
    insert into public.finance_expenses (id, tenant_id, company_id, operation_receipt_id,
      source_reference, description, amount_minor, currency, state, version, posted_journal_id, created_by)
    values ('93900000-0000-4000-8000-000000000093', '93900000-0000-4000-8000-000000000010',
      '93900000-0000-4000-8000-000000000020', '93900000-0000-4000-8000-000000000048',
      'expense-wrong-source', 'Wrong source', 10, 'AED', 'posted', 1,
      '93900000-0000-4000-8000-000000000081', '93900000-0000-4000-8000-000000000001');
    raise exception 'EXPENSE_PROVENANCE_ACCEPTED';
  exception when check_violation then null; end;
  begin
    insert into public.finance_operation_receipts (
      id, tenant_id, company_id, actor_id, operation_id, aggregate_kind, aggregate_id,
      expected_version, committed_version, payload_hash, sanitized_result
    ) values (
      '93900000-0000-4000-8000-00000000004e', '93900000-0000-4000-8000-000000000010',
      '93900000-0000-4000-8000-000000000020', '93900000-0000-4000-8000-000000000001',
      '93900000-0000-4000-8000-00000000004f', 'compensation',
      '93900000-0000-4000-8000-000000000094', 0, 1, repeat('2', 64), '{"code":"proof"}'
    );
    insert into public.pro_compensations (id, tenant_id, company_id, pro_profile_id,
      company_assignment_id, company_assignment_assigned_at,
      commercial_term_id, commercial_term_version, commercial_term_model,
      commercial_term_amount_minor, commercial_term_scope, commercial_term_effective_from,
      operation_receipt_id, source_reference,
      amount_minor, currency, created_by)
    values ('93900000-0000-4000-8000-000000000094', '93900000-0000-4000-8000-000000000010',
      '93900000-0000-4000-8000-000000000020', '93900000-0000-4000-8000-000000000003',
      '93900000-0000-4000-8000-000000000095', '2026-09-22 00:00:00+00',
      '93900000-0000-4000-8000-000000000090', 2, 'per_registration', 10,
      'all_registrations', current_date, '93900000-0000-4000-8000-00000000004e',
      'compensation-wrong-term', 10, 'AED', '93900000-0000-4000-8000-000000000001');
    raise exception 'COMPENSATION_PROVENANCE_ACCEPTED';
  exception when check_violation then null; end;
  update public.finance_expenses
  set state = 'posted', version = 3, posted_journal_id = '93900000-0000-4000-8000-000000000081',
    updated_at = pg_catalog.clock_timestamp()
  where id = '93900000-0000-4000-8000-000000000091';
  update public.pro_compensations
  set state = 'posted', version = 3, posted_journal_id = '93900000-0000-4000-8000-000000000082',
    updated_at = pg_catalog.clock_timestamp()
  where id = '93900000-0000-4000-8000-000000000092';
  update public.pro_commercial_terms set status = 'ended', effective_to = current_date,
    updated_at = pg_catalog.clock_timestamp()
  where id = '93900000-0000-4000-8000-000000000090';
  update public.pro_company_assignments
  set status = 'released', released_at = pg_catalog.clock_timestamp(),
    released_by = '93900000-0000-4000-8000-000000000001', release_reason = 'Historical reversal proof',
    updated_at = pg_catalog.clock_timestamp()
  where id = '93900000-0000-4000-8000-000000000095';
  update public.pro_compensations
  set state = 'reversed', version = 4, updated_at = pg_catalog.clock_timestamp()
  where id = '93900000-0000-4000-8000-000000000092';
  if not exists (
    select 1 from public.pro_compensations
    where id = '93900000-0000-4000-8000-000000000092' and state = 'reversed'
  ) then raise exception 'HISTORICAL_COMPENSATION_REVERSAL_REJECTED'; end if;
end;
$p309_expense_compensation_provenance$;

insert into public.event_contract_registrations (event_type, event_version, payload_schema)
values ('finance.test.rollback', 1, '{"resource_id":"uuid"}');
insert into public.event_consumer_registrations (
  consumer_name, event_type, event_version, max_attempts, default_lease_seconds
) values ('internal.finance.test', 'finance.test.rollback', 1, 1, 120);
do $p309_event_rollback_contract$
begin
  begin
    insert into public.finance_audit_log (tenant_id, company_id, actor_id, operation_receipt_id,
      action, resource_kind, resource_id)
    values ('93900000-0000-4000-8000-000000000010', '93900000-0000-4000-8000-000000000020',
      '93900000-0000-4000-8000-000000000001', '93900000-0000-4000-8000-000000000040',
      'finance.rollback', 'invoice', '93900000-0000-4000-8000-000000000031');
    perform public.publish_domain_event(
      '93900000-0000-4000-8000-0000000000a0', 'finance.test.rollback', 1::smallint,
      pg_catalog.now(), '93900000-0000-4000-8000-000000000010',
      '93900000-0000-4000-8000-000000000020', '93900000-0000-4000-8000-000000000001',
      '93900000-0000-4000-8000-0000000000a1', null, 'internal',
      '{"resource_id":"93900000-0000-4000-8000-000000000031"}', repeat('8', 64)
    );
    raise exception 'FORCED_FINANCE_EVENT_ROLLBACK';
  exception when raise_exception then
    if sqlerrm <> 'FORCED_FINANCE_EVENT_ROLLBACK' then raise; end if;
  end;
  if exists (select 1 from public.domain_events where id = '93900000-0000-4000-8000-0000000000a0')
    or exists (select 1 from public.finance_audit_log where action = 'finance.rollback')
  then raise exception 'FINANCE_EVENT_ROLLBACK_NOT_ATOMIC'; end if;
end;
$p309_event_rollback_contract$;

rollback;
