import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import React from 'react';

const reactServer = '__SERVER_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE' in React;
const renderTest = reactServer ? ((() => undefined) as unknown as typeof test) : test;

if (reactServer) {
  test('dashboard rendered accessibility contracts run under the client React export condition', () => {
    const result = spawnSync(
      process.execPath,
      ['--import', 'tsx', fileURLToPath(import.meta.url)],
      { encoding: 'utf8' },
    );
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  });
}

const layout = readFileSync(new URL('./DashboardLayout.tsx', import.meta.url), 'utf8');
const sidebar = readFileSync(new URL('./DashboardSidebar.tsx', import.meta.url), 'utf8');
const sidebarPrimitive = readFileSync(new URL('../ui/sidebar.tsx', import.meta.url), 'utf8');
const topbar = readFileSync(new URL('./DashboardTopbar.tsx', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../../app/globals.css', import.meta.url), 'utf8');

test('dashboard shell exposes one top-level main landmark', () => {
  assert.match(layout, /<SidebarInset>[\s\S]*<div id="main-content"/);
  assert.doesNotMatch(layout, /<SidebarInset>[\s\S]*<main/);
  assert.match(layout, /<DashboardSkipLink \/>/u);
});

test('dashboard shell exposes nav-kind hooks for PRO-only Signal Studio styling', () => {
  assert.match(layout, /className="dashboard-surface"/u);
  assert.match(layout, /<SidebarProvider[\s\S]{0,180}data-nav-kind=\{navKind\}/);
  assert.match(sidebar, /<Sidebar[^>]*data-nav-kind=\{navKind\}/);
});

test('all four role rails share near-black Signal shell geometry and warm canvases', () => {
  assert.match(styles, /\.dashboard-surface,[\s\S]{0,500}--signal-canvas:\s*#f5f2ee/u);
  assert.match(styles, /\.dark \.dashboard-surface,[\s\S]{0,500}--signal-canvas:\s*#141312/u);
  assert.match(
    styles,
    /\[data-nav-kind\] \[data-slot='sidebar-inner'\][\s\S]{0,180}background:\s*#121110/u,
  );
  assert.match(styles, /\.dashboard-main[\s\S]{0,100}max-width:\s*96rem/u);
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

test('dashboard topbar collapses nonessential chrome at a 200 percent mobile reflow', () => {
  assert.match(topbar, /max-\[240px\]:px-2/u);
  assert.match(topbar, /max-\[240px\]:hidden/u);
  assert.match(topbar, /max-\[240px\]:gap-1/u);
});

test('dashboard surface honors reduced motion across chrome and content', () => {
  assert.match(
    styles,
    /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.dashboard-surface \*[\s\S]*?transition-duration:\s*0\.01ms !important/u,
  );
});

test('dashboard inset may shrink beside the tablet sidebar without page overflow', () => {
  assert.match(sidebarPrimitive, /relative flex w-full min-w-0 flex-1 flex-col/u);
});

test('dashboard uses application fonts and lifecycle semantic surfaces in both themes', () => {
  const rootLayout = readFileSync(new URL('../../app/layout.tsx', import.meta.url), 'utf8');
  assert.match(rootLayout, /Noto_Kufi_Arabic/u);
  assert.match(rootLayout, /--font-arabic/u);
  assert.match(styles, /\[dir='rtl'\][\s\S]*font-family:\s*var\(--font-arabic\)/u);
  for (const token of ['lifecycle-surface', 'lifecycle-subtle', 'lifecycle-border']) {
    assert.match(styles, new RegExp(`--${token}:`, 'u'));
    assert.match(styles, new RegExp(`\\.dark[\\s\\S]*--${token}:`, 'u'));
  }
});

test('collapsed dashboard submenu applies inert alongside aria-hidden', () => {
  assert.match(sidebar, /aria-hidden=\{!open\}[\s\S]{0,80}inert=\{!open\}/u);
});

test('every active navigation link exposes aria-current page', () => {
  assert.match(
    sidebar,
    /<Link href=\{item\.href\} aria-current=\{active \? 'page' : undefined\}>/u,
  );
  assert.match(sidebar, /aria-current=\{activeHref === child\.href \? 'page' : undefined\}/u);
});

test('topbar uses safe typed breadcrumbs and complete truthful utilities', () => {
  assert.match(topbar, /buildShellBreadcrumbs/u);
  assert.doesNotMatch(topbar, /pathname[\s\S]{0,120}split\('\/'\)/u);
  assert.match(topbar, /<DashboardCommand/u);
  assert.match(topbar, /<DashboardNotifications/u);
  assert.match(topbar, /<DashboardAccountMenu/u);
  assert.doesNotMatch(topbar, /<LogoutButton/u);
});

renderTest('collapsed dashboard submenus remove their links from keyboard focus', async () => {
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { DashboardSidebarNavItem } = await import('./DashboardSidebar');
  const { SidebarMenu, SidebarProvider } = await import('@/components/ui/sidebar');
  const { adminNav } = await import('@/lib/shell/nav-admin');
  const item = adminNav.flatMap((group) => group.items).find((entry) => entry.children?.length);
  assert.ok(item, 'expected an admin navigation item with children');

  const html = renderToStaticMarkup(
    React.createElement(
      SidebarProvider,
      null,
      React.createElement(
        SidebarMenu,
        null,
        React.createElement(DashboardSidebarNavItem, {
          item,
          activeHref: '/admin',
          translate: (_key: string | undefined, fallback: string | undefined) => fallback ?? '',
          navKind: 'admin',
        }),
      ),
    ),
  );
  const collapsedSubmenu = html.match(/<div aria-hidden="true"[^>]*>/u);
  assert.ok(collapsedSubmenu, 'expected a rendered collapsed admin submenu');
  assert.match(collapsedSubmenu[0], /\sinert(?:=""|(?=\s|>))/u);
});
