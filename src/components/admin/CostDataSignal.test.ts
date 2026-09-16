import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(path, 'utf8');
const page = read('src/app/admin/cost-data/page.tsx');
const table = read('src/components/admin/CostDataTable.tsx');
const css = read('src/app/globals.css');

test('Cost Data explicitly opts into management styling without broadening overview scope', () => {
  assert.match(page, /admin-management-signal cost-data-workspace/u);
  assert.match(css, /\[data-nav-kind='admin'\]:has\(\.admin-signal-dashboard\)/u);
  assert.match(css, /\[data-nav-kind='admin'\]:has\(\.admin-management-signal\)/u);
  assert.doesNotMatch(page, /admin-platform-signal|signal-kpi|signal-panel/u);
});

test('Cost Data keeps direct authorization, exact query and loader contracts', () => {
  assert.match(page, /await requireRole\('super_admin', 'admin'\)/u);
  assert.match(page, /Promise\.all\(\[getCostDataSummary\(\), listCostDataRows\(filters\)\]\)/u);
  for (const key of ['jurisdiction', 'q', 'active', 'feeType', 'estimateGrade']) {
    assert.match(page, new RegExp('sp\\.' + key));
  }
  for (const key of [
    'totalRows',
    'activeRows',
    'estimateGradeRows',
    'uniqueAuthorities',
    'staleRows',
  ]) {
    assert.match(page, new RegExp('summary\\.' + key));
  }
  for (const href of [
    '/admin/cost-data',
    '/admin/cost-data?active=active',
    '/admin/cost-data?active=inactive',
  ]) {
    assert.ok(page.includes('href="' + href + '"'));
  }
  assert.match(page, /new URLSearchParams\(cleanParams\(sp\)\)/u);
  assert.equal((page.match(/<h1/g) ?? []).length, 1);
});

test('Cost Data exposes one labelled keyboard scroll region and logical alignment', () => {
  assert.match(table, /scrollAreaLabel=\{t\('costData.page.feeRows'\)\}/u);
  assert.doesNotMatch(table, /overflow-x-auto|text-right/u);
  for (const key of [
    'authority',
    'fee',
    'status',
    'range',
    'timeline',
    'validity',
    'amount',
    'actions',
  ]) {
    assert.ok(table.includes("t('costData.table." + key + "')"));
  }
  assert.match(table, /renderActions\(row\)/u);
  assert.match(table, /formatMinorAsAed\(row.amountMinor\)/u);
});

test('Cost Data dialogs are scoped, localized, viewport-scrollable working forms', () => {
  for (const file of ['CostDataDialog', 'CostDataImportDialog']) {
    const source = read('src/components/admin/' + file + '.tsx');
    assert.match(source, /cost-data-dialog/u);
    assert.match(source, /closeLabel=\{t\('costData.close'\)\}/u);
  }
  const imported = read('src/components/admin/CostDataImportDialog.tsx');
  assert.match(imported, /aria-label=\{t\('costData.import.csvLabel'\)\}/u);
  const dialog = read('src/components/admin/CostDataDialog.tsx');
  for (const field of [
    'authority',
    'jurisdiction',
    'emirate',
    'feeType',
    'recurrence',
    'activityKey',
    'label',
    'amount',
    'minShareholders',
    'maxShareholders',
    'minVisas',
    'maxVisas',
    'timelineMinDays',
    'timelineMaxDays',
    'validFrom',
    'validTo',
    'requiredDocumentKeys',
    'currency',
    'estimateGrade',
    'active',
  ]) {
    assert.ok(dialog.includes('"' + field + '"'), field);
  }
  assert.match(dialog, /updateCostDataAction\(\{ \.\.\.payload, id: row.id \}\)/u);
  assert.match(dialog, /createCostDataAction\(payload\)/u);
});

test('Cost Data status and partial import result contracts remain exact', () => {
  const status = read('src/components/admin/CostDataStatusButton.tsx');
  assert.match(status, /toggleCostDataAction\(\{ id, active: !active \}\)/u);
  assert.match(status, /disabled=\{pending\}/u);
  assert.match(status, /router\.refresh\(\)/u);
  const imported = read('src/components/admin/CostDataImportDialog.tsx');
  assert.match(imported, /result\.data\.errors\.length/u);
  assert.match(imported, /insertedWithErrors/u);
  assert.match(imported, /disabled=\{pending \|\| !csv\.trim\(\)\}/u);
  assert.match(imported, /router\.refresh\(\)/u);
  const dialog = read('src/components/admin/CostDataDialog.tsx');
  assert.match(dialog, /Select dir=\{dir\}/u);
  assert.match(dialog, /cost-data-select/u);
});
