import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

test('lead pipeline shows a real filtered funnel and explains its existing score', () => {
  const source = read('src/app/admin/leads/page.tsx');
  assert.match(source, /DashboardPageHeader/u);
  assert.match(source, /kanban\.new\.length/u);
  assert.match(source, /kanban\.contacted\.length/u);
  assert.match(source, /kanban\.qualified\.length/u);
  assert.match(source, /kanban\.won\.length/u);
  assert.match(source, /kanban\.lost\.length/u);
  assert.match(source, /scoringExplanation/u);
});

test('finance is directly guarded and separates accounting from subscription reporting', () => {
  const page = read('src/app/admin/finance/page.tsx');
  const data = read('src/lib/data/finance.ts');
  assert.match(page, /requirePlatformOperator\(\)/u);
  assert.match(page, /pointInTime/u);
  assert.match(page, /currenciesSeparated/u);
  assert.match(page, /includedActive/u);
  assert.match(page, /excludedStatuses/u);
  assert.match(page, /loadFinanceReport/u);
  assert.match(page, /loadSubscriptionReport/u);
  assert.match(page, /formatMoney\(report\.profitMinor, currency, locale\)/u);
  assert.match(data, /\.eq\('status', 'active'\)/u);
});

test('users expose explicit all-user and PRO-registry modes', () => {
  const source = read('src/app/admin/users/page.tsx');
  assert.match(source, /modeNavigation/u);
  assert.match(source, /href="\/admin\/users"/u);
  assert.match(source, /href="\/admin\/users\?role=pro"/u);
});

test('WhatsApp approvals disclose manual provider truth', () => {
  const source = read('src/app/admin/whatsapp-templates/page.tsx');
  assert.match(source, /providerCaveat/u);
  assert.match(source, /providerAudit/u);
});
