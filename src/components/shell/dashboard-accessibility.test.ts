import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const layout = readFileSync(new URL('./DashboardLayout.tsx', import.meta.url), 'utf8');
const sidebar = readFileSync(new URL('./DashboardSidebar.tsx', import.meta.url), 'utf8');

test('dashboard shell exposes one top-level main landmark', () => {
  assert.match(layout, /<SidebarInset>[\s\S]*<div id="main-content"/);
  assert.doesNotMatch(layout, /<SidebarInset>[\s\S]*<main/);
});

test('dashboard sidebar content belongs to one named navigation landmark', () => {
  assert.match(sidebar, /<nav aria-label=\{brand\} className="contents">/);
  assert.match(sidebar, /<nav[\s\S]*<SidebarHeader>[\s\S]*<SidebarFooter>[\s\S]*<\/nav>/);
});
