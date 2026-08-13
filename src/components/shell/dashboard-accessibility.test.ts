import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const layout = readFileSync(new URL('./DashboardLayout.tsx', import.meta.url), 'utf8');
const sidebar = readFileSync(new URL('./DashboardSidebar.tsx', import.meta.url), 'utf8');
const topbar = readFileSync(new URL('./DashboardTopbar.tsx', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../../app/globals.css', import.meta.url), 'utf8');

test('dashboard shell exposes one top-level main landmark', () => {
  assert.match(layout, /<SidebarInset>[\s\S]*<div id="main-content"/);
  assert.doesNotMatch(layout, /<SidebarInset>[\s\S]*<main/);
});

test('dashboard shell exposes nav-kind hooks for PRO-only Signal Studio styling', () => {
  assert.match(layout, /<SidebarProvider[\s\S]{0,180}data-nav-kind=\{navKind\}/);
  assert.match(sidebar, /<Sidebar[^>]*data-nav-kind=\{navKind\}/);
});

test('PRO shell expands to the Design B rail and collapses to its icon width', () => {
  assert.match(layout, /SIGNAL_STUDIO_SIDEBAR_STYLE/);
  assert.match(layout, /'--sidebar-width': '12\.25rem'/);
  assert.match(layout, /'--sidebar-width-icon': '5\.125rem'/);
  assert.match(layout, /style=\{navKind === 'pro' \? SIGNAL_STUDIO_SIDEBAR_STYLE : undefined\}/);
  assert.match(
    styles,
    /\[data-nav-kind='pro'\]\[data-slot='sidebar'\]\[data-state='collapsed'\] \.dashboard-brand__copy[\s\S]{0,80}display:\s*none\s*!important/,
  );
  assert.match(
    styles,
    /\[data-nav-kind='pro'\]\[data-slot='sidebar'\]\[data-state='collapsed'\] \[data-slot='sidebar-group'\][\s\S]{0,80}padding-inline:\s*25px/,
  );
});

test('PRO sidebar uses the provider scope and compact horizontal Design B rows', () => {
  assert.match(styles, /\[data-nav-kind='pro'\] \[data-slot='sidebar-container'\]/);
  assert.match(styles, /\[data-nav-kind='pro'\][\s\S]{0,5000}flex-direction: row/);
  assert.match(styles, /background:\s*#121110\s*!important/);
  assert.match(
    styles,
    /\[data-slot='sidebar-group-label'\][\s\S]{0,120}\{\s*display:\s*none\s*!important/,
  );
});

test('PRO shell scales the embedded Design B frame for a full-width dashboard', () => {
  assert.match(styles, /--signal-scale:\s*2/);
  assert.match(styles, /--sidebar-width:\s*12\.25rem/);
  assert.match(styles, /--sidebar-width-icon:\s*5\.125rem/);
});

test('PRO rail uses the live-port display labels while preserving every route', () => {
  assert.match(sidebar, /const PRO_SIGNAL_LABEL_KEYS/);
  assert.match(sidebar, /commandCenter:\s*'signalCommand'/);
  assert.match(sidebar, /applications:\s*'signalCases'/);
  assert.match(sidebar, /payments:\s*'signalFinance'/);
  assert.match(sidebar, /navKind === 'pro'/);
});

test('dashboard sidebar content belongs to one named navigation landmark', () => {
  assert.match(sidebar, /<nav aria-label=\{brand\} className="contents">/);
  assert.match(sidebar, /<nav[\s\S]*<SidebarHeader>[\s\S]*<SidebarFooter>[\s\S]*<\/nav>/);
});

test('dashboard sidebar follows the active locale direction', () => {
  assert.match(sidebar, /useLocale\(\)/);
  assert.match(sidebar, /side=\{locale === 'ar' \? 'right' : 'left'\}/);
  assert.match(sidebar, /dir=\{locale === 'ar' \? 'rtl' : 'ltr'\}/);
});

test('dashboard topbar lets breadcrumbs shrink before mobile actions overflow', () => {
  assert.match(topbar, /className="text-muted-foreground[^"\n]*min-w-0[^"\n]*overflow-hidden/);
  assert.match(topbar, /className="ms-auto flex shrink-0 items-center/);
});
