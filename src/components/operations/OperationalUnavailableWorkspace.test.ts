import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(
  new URL('./OperationalUnavailableWorkspace.tsx', import.meta.url),
  'utf8',
);

test('shared unavailable workspace uses canonical heading and route state primitives', () => {
  assert.match(source, /DashboardPageHeader/u);
  assert.match(source, /DashboardRouteState/u);
  assert.match(source, /state="unavailable"/u);
});

test('shared unavailable workspace keeps 1.5rem below the page-header border', () => {
  assert.match(source, /className="signal-dashboard min-w-0 space-y-6"/u);
});

test('calendar unavailable geometry retains an accessible list alternative', () => {
  assert.match(source, /data-operational-list-alternative/u);
  assert.match(source, /<ul/u);
});

test('shared presentation contains no data access or mutation boundary', () => {
  assert.doesNotMatch(source, /supabase|service-role|completeTask|outbox|audit-log/u);
  assert.doesNotMatch(source, /use server/u);
});
