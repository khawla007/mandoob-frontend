import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const layout = readFileSync(new URL('./DashboardLayout.tsx', import.meta.url), 'utf8');
const customerMain = readFileSync(
  new URL('../customer/CustomerPortalMain.tsx', import.meta.url),
  'utf8',
);
const styles = readFileSync(new URL('../../app/globals.css', import.meta.url), 'utf8');

function createClassRoot() {
  const classes = new Set<string>();
  return {
    classes,
    root: {
      classList: {
        add: (...tokens: string[]) => tokens.forEach((token) => classes.add(token)),
        remove: (...tokens: string[]) => tokens.forEach((token) => classes.delete(token)),
      },
    },
  };
}

test('dashboard layouts mount the explicit portal token scope', () => {
  assert.match(layout, /<DashboardSurfaceScope\s*\/>/u);
  assert.match(customerMain, /<DashboardSurfaceScope\s*\/>/u);
});

test('dashboard portal token CSS does not require selector :has support', () => {
  assert.doesNotMatch(styles, /body:has\(\.dashboard-surface\)/u);
  assert.match(styles, /\.dashboard-surface,\s*body\.dashboard-surface-active\s*\{/u);
  assert.match(styles, /\.dark \.dashboard-surface,\s*\.dark body\.dashboard-surface-active\s*\{/u);
});

test('dashboard scope is reference counted and cleans the body class exactly once', async () => {
  const { acquireDashboardSurfaceScope } = await import('./DashboardSurfaceScope');
  const { classes, root } = createClassRoot();

  const releaseFirst = acquireDashboardSurfaceScope(root);
  const releaseSecond = acquireDashboardSurfaceScope(root);
  assert.equal(classes.has('dashboard-surface-active'), true);

  releaseFirst();
  releaseFirst();
  assert.equal(classes.has('dashboard-surface-active'), true);

  releaseSecond();
  assert.equal(classes.has('dashboard-surface-active'), false);
});

test('dashboard scope counts are isolated per root', async () => {
  const { acquireDashboardSurfaceScope } = await import('./DashboardSurfaceScope');
  const first = createClassRoot();
  const second = createClassRoot();

  const releaseFirst = acquireDashboardSurfaceScope(first.root);
  const releaseSecond = acquireDashboardSurfaceScope(second.root);
  releaseFirst();
  assert.equal(first.classes.has('dashboard-surface-active'), false);
  assert.equal(second.classes.has('dashboard-surface-active'), true);
  releaseSecond();
});
