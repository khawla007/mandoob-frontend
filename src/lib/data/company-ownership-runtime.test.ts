import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();
const source = (path: string) => readFileSync(join(root, path), 'utf8');

const applicationForm = source('src/components/pro/applications/ApplicationCreateForm.tsx');
const applicationLogic = source('src/app/(tenant)/t/[tenant]/(pro)/applications/action-logic.ts');
const renewalDialog = source('src/components/pro/NewRenewalDialog.tsx');
const renewalActions = source('src/app/(tenant)/t/[tenant]/(pro)/renewals/actions.ts');
const invoiceDialog = source('src/components/pro/NewInvoiceDialog.tsx');
const invoiceActions = source('src/app/(tenant)/t/[tenant]/(pro)/payments/actions.ts');

test('Task 9 public ownership contracts use company terminology throughout runtime modules', () => {
  const paths = [
    'src/lib/data/documents.ts',
    'src/lib/data/employee-portal.ts',
    'src/lib/data/renewals.ts',
    'src/lib/data/meetings.ts',
    'src/lib/data/comms.ts',
    'src/lib/data/service-cases.ts',
    'src/components/pro/RenewalsTable.tsx',
    'src/app/(tenant)/t/[tenant]/(pro)/renewals/page.tsx',
  ];
  const runtime = paths.map(source).join('\n');
  const forbidden = [
    ['client', 'Id'].join(''),
    ['Client', 'Id'].join(''),
    ['client', 'Name'].join(''),
    ['For', 'Client'].join(''),
    ['ServiceCase', 'Clients'].join(''),
    ['Client', 'Lite'].join(''),
    ['show', 'ClientColumn'].join(''),
  ];
  for (const token of forbidden) assert.equal(runtime.includes(token), false, token);
  assert.doesNotMatch(runtime, new RegExp(`\\b${['cli', 'ents'].join('')}\\s*\\(`, 'u'));
});

test('PRO application creation derives company ownership and exposes no company selector', () => {
  assert.doesNotMatch(
    applicationForm,
    new RegExp(`company_id|selectCompany|companies=|${['cli', 'ents'].join('')}=`, 'u'),
  );
  assert.match(applicationLogic, /resolveAssignedCompany\(session\.id, slug\)/);
  assert.match(applicationLogic, /company_id: company\.id/);
  assert.doesNotMatch(applicationLogic, /optionalFormValue\(raw, 'company_id'\)/);
});

test('PRO renewal creation derives company ownership and exposes no company selector', () => {
  assert.doesNotMatch(renewalDialog, /companyId|fixedCompanyId|clients|<Select[^>]*company/i);
  assert.match(renewalActions, /readAssignedCompanyForPro\(session\.id, slug\)/);
  assert.match(renewalActions, /company_id: ctx\.companyId/);
});

test('PRO invoice creation derives company ownership and exposes no company selector', () => {
  assert.doesNotMatch(invoiceDialog, /companyId|fixedCompanyId|clients|invoice-company/i);
  assert.match(invoiceActions, /resolveAssignedCompanyForCaller\(ctx\)/);
  assert.match(invoiceActions, /companyId: company\.id/);
  assert.doesNotMatch(invoiceActions, /\.eq\('id', input\.companyId\)/);
});

test('renewal and invoice lifecycle mutations reject same-tenant rows from another company', () => {
  const renewalData = source('src/lib/data/renewals.ts');
  assert.match(renewalActions, /companyId: company\.id/u);
  assert.match(renewalData, /existing\.company_id !== ctx\.companyId/u);
  assert.match(renewalData, /\.eq\('company_id', ctx\.companyId\)/u);
  assert.match(renewalData, /input\.company_id !== ctx\.companyId/u);

  assert.match(invoiceActions, /resolveAssignedCompanyForCaller\(ctx\)/u);
  assert.match(invoiceActions, /rpc\(\s*'mark_company_invoice_paid'/u);
  assert.match(invoiceActions, /rpc\(\s*'void_company_invoice'/u);
  assert.match(invoiceActions, /rpc\(\s*'prepare_company_refund'/u);
  assert.match(invoiceActions, /rpc\(\s*'reconcile_company_refund'/u);
  assert.match(invoiceActions, /p_company_id: company\.id/u);
});

test('invoice receipt reads bind every child lookup to the authoritative tenant and company', () => {
  const invoiceData = source('src/lib/data/invoices.ts');
  const receipt = invoiceData.slice(invoiceData.indexOf('async function loadReceiptPayload'));
  assert.match(receipt, /\.from\('company_profiles'\)[\s\S]*?\.eq\('tenant_id', tenantId\)/u);
  assert.match(receipt, /\.from\('payments'\)[\s\S]*?\.eq\('tenant_id', tenantId\)/u);
  assert.match(receipt, /\.from\('refunds'\)[\s\S]*?\.eq\('tenant_id', tenantId\)/u);
});

test('communications, customer portal, import, and erasure preserve full company ownership chains', () => {
  const comms = source('src/lib/data/comms.ts');
  const customerDocuments = source(
    'src/app/(tenant)/t/[tenant]/(customer)/portal/documents/actions.ts',
  );
  const erasure = source('src/lib/data/erasure.ts');
  assert.match(comms, /getCommsForCompany\(company\.tenant_id, link\.linked_company_id/u);
  assert.match(customerDocuments, /doc\.company_id !== ctx\.linkedCompanyId/u);
  assert.match(
    erasure,
    /rpc\(\s*'prepare_erasure_cleanup'[\s\S]*?p_tenant_id: detail\.subjectTenantId[\s\S]*?p_subject_user_id: detail\.subjectUserId/u,
  );
  assert.match(erasure, /rpc\(\s*'complete_erasure_cleanup'/u);
});

test('every PRO application, renewal, and finance page resolves its live company before service-role reads', () => {
  const pages = [
    source('src/app/(tenant)/t/[tenant]/(pro)/applications/page.tsx'),
    source('src/app/(tenant)/t/[tenant]/(pro)/renewals/page.tsx'),
    source('src/app/(tenant)/t/[tenant]/(pro)/payments/page.tsx'),
    source('src/app/(tenant)/t/[tenant]/(pro)/payments/analytics/page.tsx'),
    source('src/app/(tenant)/t/[tenant]/(pro)/payments/[invoiceId]/page.tsx'),
    source('src/app/(tenant)/t/[tenant]/(pro)/payments/[invoiceId]/receipt/route.ts'),
  ];
  for (const page of pages) {
    const assignment = page.indexOf('readAssignedCompanyForPro(session.id, slug)');
    assert.ok(assignment >= 0);
    assert.match(page.slice(assignment), /company\.id/u);
  }
});
