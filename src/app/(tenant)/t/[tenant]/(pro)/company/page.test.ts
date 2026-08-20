import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { auditUseServerRuntimeExports } from '@/lib/testing/use-server-export-audit';

const root = process.cwd();
const page = readFileSync(join(root, 'src/app/(tenant)/t/[tenant]/(pro)/company/page.tsx'), 'utf8');
const actions = readFileSync(
  join(root, 'src/app/(tenant)/t/[tenant]/(pro)/company/actions.ts'),
  'utf8',
);
const form = readFileSync(join(root, 'src/components/pro/CompanyProfileForm.tsx'), 'utf8');
const tabs = readFileSync(join(root, 'src/components/pro/AssignedCompanyTabs.tsx'), 'utf8');
const english = JSON.parse(readFileSync(join(root, 'src/messages/en.json'), 'utf8'));
const arabic = JSON.parse(readFileSync(join(root, 'src/messages/ar.json'), 'utf8'));
const employeeImport = readFileSync(
  join(root, 'src/app/(tenant)/t/[tenant]/(pro)/employees/import/page.tsx'),
  'utf8',
);
const importActions = readFileSync(
  join(root, 'src/app/(tenant)/t/[tenant]/(pro)/imports/actions.ts'),
  'utf8',
);

test('one-release legacy company deep link authorizes and preserves approved focus only', () => {
  const legacy = readFileSync(
    join(
      root,
      'src/app/(tenant)/t/[tenant]/(pro)',
      ['cli', 'ents'].join(''),
      '[companyId]/page.tsx',
    ),
    'utf8',
  );
  const authAt = legacy.indexOf('requireProTenantRouteAccess(slug)');
  const redirectAt = legacy.indexOf('permanentRedirect(');
  assert.notEqual(authAt, -1);
  assert.ok(authAt < redirectAt);
  assert.match(legacy, /params: Promise<\{ tenant: string; companyId: string \}>/u);
  assert.match(legacy, /parseAssignedCompanySearch\(await searchParams\)/u);
  assert.match(legacy, /query\.set\('document', focus\.documentId\)/u);
  assert.match(legacy, /query\.set\('request', focus\.requestId\)/u);
  assert.match(legacy, /`\/t\/\$\{encodeURIComponent\(slug\)\}\/company\?\$\{query\}`/u);
  assert.doesNotMatch(legacy, /createSupabase|readAssignedCompany|ClientTabs|EditClientForm/u);
});

test('Assigned Company page directly authorizes before its service-role workspace read', () => {
  const authAt = page.indexOf('requireProTenantRouteAccess(');
  const readAt = page.indexOf('readAssignedCompanyForPro(');
  assert.notEqual(authAt, -1);
  assert.ok(authAt < readAt);
  assert.match(page, /readAssignedCompanyForPro\(session\.id, slug\)/);
  assert.match(page, /if \(!company\) notFound\(\)/);
});

test('Assigned Company page is compact, localized, and keeps exact document deep links', () => {
  assert.doesNotMatch(page, /hero/i);
  assert.doesNotMatch(page, /<main/u);
  assert.match(page, /getTranslations\('pro\.assignedCompany'\)/);
  assert.match(page, /CompanyProfileForm/);
  assert.match(page, /AssignedCompanyTabs/);
  assert.match(tabs, /tab=documents&document=/);
  assert.doesNotMatch(page, /switch|createClient|ClientTabs|EditClientForm/);
});

test('Assigned Company page composes real isolated company workspace panels', () => {
  assert.match(page, /loadAssignedCompanyWorkspace\(company\.tenantId, company\.id, focus\)/);
  assert.match(page, /workspace=\{workspace\}/);
  assert.match(tabs, /workspace\.documents/);
  assert.match(tabs, /workspace\.requests/);
  assert.match(tabs, /workspace\.renewals/);
  assert.match(tabs, /workspace\.payments/);
  assert.match(tabs, /workspace\.activity/);
  assert.match(tabs, /focusedDocumentId === document\.id/);
  assert.match(tabs, /focusedRequestId === request\.id/);
  assert.match(page, /workspace\.documents\.focusedId/);
  assert.match(page, /workspace\.requests\.focusedId/);
  assert.doesNotMatch(tabs, /company\.createdAt|company\.updatedAt/);
  assert.doesNotMatch(tabs, /renewals\?company=|payments\?company=/);
  assert.doesNotMatch(
    tabs,
    /title=\{entry\.action\}|\$\{entry\.source\}|\$\{renewal\.status\}|\$\{invoice\.status\}/,
  );
  assert.match(page, /locale=\{locale\}/);
  assert.match(tabs, /formatCompanyMoney\(invoice\.amountMinor, invoice\.currency, locale\)/);
  assert.match(tabs, /if \(state\.status === 'unrequested'\) return null/);
  assert.match(tabs, /state\.status === 'error'/);
});

test('Assigned Company operational labels have exact English and Arabic parity', () => {
  const expected = {
    renewalStatuses: ['cancelled', 'completed', 'due_soon', 'overdue', 'upcoming'],
    paymentStatuses: ['draft', 'open', 'paid', 'partially_refunded', 'refunded', 'void'],
    auditActions: [
      'approved',
      'bulk_imported',
      'cancelled',
      'company_pro_assigned',
      'company_pro_released',
      'completed',
      'created',
      'erasure_approved',
      'erasure_completed',
      'erasure_rejected',
      'erasure_requested',
      'erasure_verified',
      'infected_blocked',
      'invoice_created',
      'invoice_marked_paid',
      'invoice_voided',
      'lead_assigned',
      'lead_created',
      'lead_note_added',
      'lead_stage_changed',
      'meeting_cancelled',
      'meeting_completed',
      'meeting_recording_attached',
      'meeting_scheduled',
      'meeting_slot_created',
      'payment_failed',
      'payment_initiated',
      'payment_succeeded',
      'reactivated',
      'reconciled',
      'refund_issued',
      'rejected',
      'service_case_created',
      'service_case_updated',
      'session_revoked',
      'suspended',
      'unlocked',
      'updated',
      'whatsapp_template_status_updated',
      'comms_skipped_opted_out',
    ].sort(),
    auditSources: [
      'admin',
      'document_request',
      'inbound_keyword',
      'manual',
      'platform',
      'questionnaire',
      'renewal_reminder',
      'self_serve',
      'service_cases',
      'system',
      'tenant',
      'tenant_team',
    ],
  } as const;

  const catalogs = [english, arabic];
  for (const catalog of catalogs) {
    const assigned = catalog.pro.assignedCompany;
    assert.ok(assigned.operationalUnknown);
    assert.deepEqual(Object.keys(assigned.renewals.statuses).sort(), expected.renewalStatuses);
    assert.deepEqual(Object.keys(assigned.payments.statuses).sort(), expected.paymentStatuses);
    assert.deepEqual(Object.keys(assigned.activity.actions).sort(), expected.auditActions);
    assert.deepEqual(Object.keys(assigned.activity.sources).sort(), expected.auditSources);
  }
});

test('profile action delegates the authorized expected-version update to the atomic data layer', () => {
  assert.match(actions, /requireProTenantRouteAccess\(tenantSlug\)/);
  assert.match(actions, /updateAssignedCompanyProfile\(\{/);
  assert.match(actions, /actorId: session\.id/);
  assert.match(actions, /tenantId: tenant\.id/);
  assert.match(actions, /expectedUpdatedAt/);
  assert.match(actions, /updatedAt: result\.updatedAt/);
  assert.doesNotMatch(actions, /\.from\('company_profiles'\)|\.from\('tenant_audit_log'\)/);
  assert.match(actions, /revalidatePath\(`\/t\/\$\{tenantSlug\}\/company`\)/);
  assert.doesNotMatch(actions, /error\.message|String\(error\)/);
});

test('use-server company actions export no non-function runtime values', () => {
  assert.match(actions, /^'use server';/u);
  assert.deepEqual(auditUseServerRuntimeExports(actions), []);
  assert.match(form, /const initialCompanyProfileActionState: CompanyProfileActionState/u);
});

test('profile form provides localized inline errors and duplicate-submit prevention', () => {
  assert.match(form, /^'use client';/);
  assert.match(form, /useActionState/);
  assert.match(form, /useFormStatus/);
  assert.match(form, /aria-live="polite"/);
  assert.match(form, /aria-invalid=/);
  assert.match(form, /disabled=\{pending\}/);
  assert.match(form, /value=\{state\.updatedAt \?\? company\.updatedAt\}/);
  assert.doesNotMatch(form, />\s*(Edit|Save|Cancel|Company name|Trade license|Jurisdiction)/);
});

test('employee import no longer accepts company selection or a company identifier input', () => {
  assert.doesNotMatch(employeeImport, /listClientsForTenant|company_id|parent_company_id/);
  assert.doesNotMatch(employeeImport, /<Select|Choose client|Select the parent client/);
  assert.match(employeeImport, /readAssignedCompanyForPro\(session\.id, slug\)/);
  assert.doesNotMatch(importActions, /formData\.get\(['"](?:parent_)?(?:client|company)_id/);
  assert.match(importActions, /resolveImportCompany\(session\.id, tenant\.id, tenantSlug\)/);
  assert.match(importActions, /kind: 'employees'/);
  assert.match(importActions, /company_id: company\.id/);
  assert.doesNotMatch(importActions, /validateBulkImportRows\('company_profiles'/);
});
