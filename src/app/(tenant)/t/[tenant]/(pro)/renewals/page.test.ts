import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();
const pagePath = join(root, 'src/app/(tenant)/t/[tenant]/(pro)/renewals/page.tsx');
const tablePath = join(root, 'src/components/pro/RenewalsTable.tsx');
const workspacePath = join(root, 'src/lib/data/pro-renewal-workspace.ts');

test('renewal page is an active-tenant, assigned-Company, server-paginated read-only workspace', () => {
  const page = readFileSync(pagePath, 'utf8');
  const table = readFileSync(tablePath, 'utf8');
  const workspace = readFileSync(workspacePath, 'utf8');

  assert.match(page, /requireProTenantRouteAccess\(slug\)/u);
  assert.match(page, /requireActiveTenant\(tenant\.id\)/u);
  assert.match(page, /readAssignedCompanyForPro\(session\.id, slug\)/u);
  assert.match(page, /listProRenewalWorkspace\(/u);
  assert.match(page, /workspace\.total/u);
  assert.match(page, /<nav[^>]+aria-label=/u);
  assert.match(page, /renewalWorkspaceHref\(/u);
  assert.doesNotMatch(
    page,
    /NewRenewalDialog|createRenewalAction|updateRenewalAction|completeRenewalAction|cancelRenewalAction/u,
  );
  assert.doesNotMatch(table, /CompanyLite|showCompanyColumn|companies: Map|RenewalRowActions/u);
  assert.match(workspace, /count: 'exact'/u);
  assert.match(
    workspace,
    /\.order\('due_date', \{ ascending: true \}\)[\s\S]*?\.order\('id', \{ ascending: true \}\)/u,
  );
});

test('renewal page supports canonical Signal drilldowns, missing dates, and unavailable summaries', () => {
  const page = readFileSync(pagePath, 'utf8');
  const table = readFileSync(tablePath, 'utf8');
  const workspace = readFileSync(workspacePath, 'utf8');
  for (const name of ['tab', 'type', 'status', 'urgency', 'q', 'page', 'focus', 'due', 'renewal']) {
    assert.match(workspace, new RegExp(`['\"]${name}['\"]`, 'u'));
  }
  assert.match(page, /name="type"/u);
  assert.match(page, /name="status"/u);
  assert.match(page, /renewalStatusActiveOnly/u);
  assert.match(page, /name="urgency"/u);
  assert.match(page, /name="due"/u);
  assert.match(page, /workspace\.state === 'unavailable'/u);
  assert.match(page, /summary\.value === null/u);
  assert.match(table, /row\.dueDate[\s\S]*?labels\.missingDate/u);
  assert.match(page, /name="q"/u);
});

test('renewal route supplies localized loading and sanitized retry geometry', () => {
  const loading = readFileSync(
    join(root, 'src/app/(tenant)/t/[tenant]/(pro)/renewals/loading.tsx'),
    'utf8',
  );
  const error = readFileSync(
    join(root, 'src/app/(tenant)/t/[tenant]/(pro)/renewals/error.tsx'),
    'utf8',
  );
  assert.match(loading, /Skeleton/u);
  assert.match(loading, /aria-busy/u);
  assert.match(error, /'use client'/u);
  assert.match(error, /unstable_retry|reset/u);
  assert.doesNotMatch(error, /error\.message/u);
});

test('renewal copy stays in English-Arabic parity for unavailable actions and queue states', () => {
  const en = JSON.parse(readFileSync(join(root, 'src/messages/en.json'), 'utf8')) as {
    pro: Record<string, string>;
  };
  const ar = JSON.parse(readFileSync(join(root, 'src/messages/ar.json'), 'utf8')) as {
    pro: Record<string, string>;
  };
  for (const key of [
    'renewalMutationsUnavailable',
    'renewalMutationsUnavailableDescription',
    'renewalSummaryFiltered',
    'renewalSummaryVisible',
    'renewalSummaryMissingDates',
    'renewalSummaryExact',
    'renewalSummaryCurrentPage',
    'renewalSummaryUnavailable',
    'renewalValueUnavailable',
    'renewalFilters',
    'renewalSearch',
    'renewalUrgency',
    'renewalDateState',
    'renewalAllDateStates',
    'renewalRecordedDates',
    'renewalMissingDates',
    'renewalMissingDate',
    'renewalNoResults',
    'renewalNoResultsHint',
    'renewalQueue',
    'renewalTimeline',
    'renewalPageSummary',
    'renewalPaginationLabel',
    'renewalPreviousPage',
    'renewalNextPage',
    'renewalPartial',
    'renewalUnavailable',
    'renewalRetry',
  ]) {
    assert.equal(typeof en.pro[key], 'string', `missing en ${key}`);
    assert.equal(typeof ar.pro[key], 'string', `missing ar ${key}`);
  }
});
