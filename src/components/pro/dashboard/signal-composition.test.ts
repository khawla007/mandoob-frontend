import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import postcss from 'postcss';

const css = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8');
const styles = postcss.parse(css);
const page = readFileSync(
  join(process.cwd(), 'src/app/(tenant)/t/[tenant]/(pro)/dashboard/page.tsx'),
  'utf8',
);

function value(selector: string, property: string, media?: string) {
  let result: string | undefined;
  styles.walkRules((rule) => {
    if (!rule.selectors.includes(selector)) return;
    const parent = rule.parent;
    const query = parent?.type === 'atrule' && parent.name === 'media' ? parent.params : undefined;
    if (query !== media) return;
    rule.walkDecls(property, (declaration) => {
      result = declaration.value;
    });
  });
  return result;
}

test('restored hero and four-card row retain Design B geometry and folded decoration', () => {
  assert.equal(
    value('.signal-dashboard__layout', 'grid-template-columns'),
    'minmax(0, 1.35fr) minmax(17rem, 0.82fr)',
  );
  assert.equal(value('.signal-hero', 'min-height'), 'calc(147px * var(--signal-scale))');
  assert.equal(value('.signal-hero__content h2', 'font-size'), 'calc(13px * var(--signal-scale))');
  assert.equal(value('.signal-hero__facts', 'display'), 'grid');
  assert.equal(
    value('.signal-dashboard__kpis .signal-kpi::after', 'inset-inline-end'),
    'calc(-34px * var(--signal-scale))',
  );
  assert.ok(value('.signal-dashboard__kpis .signal-kpi::before', 'background'));
  assert.equal(value('.signal-dashboard__kpis .signal-kpi', 'overflow'), 'hidden');
  for (const selector of ['.signal-dashboard__hero', '.signal-dashboard__kpis']) {
    assert.equal(value(selector, 'min-width'), '0');
  }
});

test('hero, cards and filters wrap on mobile and tablet without clipping current Company facts', () => {
  const heading = page.match(/<header\b[\s\S]*?<\/header>/u)?.[0] ?? '';

  assert.equal(value('.signal-hero', 'height'), 'auto');
  assert.equal(value('.signal-hero__content', 'width', '(max-width: 63.99rem)'), '100%');
  assert.equal(value('.signal-hero__chart', 'position', '(max-width: 63.99rem)'), 'relative');
  assert.equal(value('.signal-hero__chart', 'width', '(max-width: 63.99rem)'), '100%');
  assert.equal(
    value(
      '.signal-dashboard__kpis .signal-kpis-grid',
      'grid-template-columns',
      '(max-width: 47.99rem)',
    ),
    'minmax(0, 1fr)',
  );
  assert.equal(value('.signal-dashboard__filters', 'position', '(max-width: 47.99rem)'), 'static');
  assert.match(heading, /signal-dashboard__heading[^"\n]*\bmd:flex-row\b[^"\n]*\bmd:items-end\b/u);
  assert.match(heading, /signal-dashboard__filters[^"\n]*\bmd:grid-cols-\[1fr_auto\]/u);
  assert.match(heading, /text-muted-foreground text-sm md:col-span-2/u);
  assert.doesNotMatch(heading, /\bsm:(?:flex-row|items-end|grid-cols-\[1fr_auto\]|col-span-2)/u);
  assert.equal(value('.signal-hero__actions a', 'min-height'), '2.75rem');
  assert.equal(value('.signal-dashboard__kpis .signal-kpi__helper', 'white-space'), 'normal');
});

test('restoration supports logical RTL placement, focus, dark surfaces, and reduced motion', () => {
  assert.equal(value('.signal-hero__chart', 'inset-inline-end'), 'calc(7px * var(--signal-scale))');
  assert.equal(value("[dir='rtl'] .signal-hero__tag", 'letter-spacing'), 'normal');
  assert.ok(value('.signal-hero__actions a:focus-visible', 'outline'));
  assert.ok(value('.dark .signal-dashboard__kpis .signal-kpi__helper', 'color'));
  assert.equal(
    value(
      '.signal-dashboard__kpis .signal-kpi::before',
      'transition',
      '(prefers-reduced-motion: reduce)',
    ),
    'none',
  );
  assert.doesNotMatch(css, /signal-hero__score/);
});

test('dashboard cards and loading keep one column until the 768px breakpoint', () => {
  for (const path of [
    'src/components/pro/dashboard/CompanySummaryDeck.tsx',
    'src/app/(tenant)/t/[tenant]/(pro)/dashboard/loading.tsx',
  ]) {
    const source = readFileSync(join(process.cwd(), path), 'utf8');
    const grid = source.match(/className="signal-kpis-grid[^"]*"/u)?.[0] ?? '';
    assert.doesNotMatch(grid, /\bsm:grid-cols-2\b/u, path);
    assert.match(grid, /\bmd:grid-cols-2\b/u, path);
  }
});

test('restored summary sizing and wrapping do not change module summary layouts', () => {
  assert.equal(value('.signal-kpi', 'height'), 'calc(102px * var(--signal-scale))');
  assert.equal(value('.signal-dashboard__kpis .signal-kpi', 'height'), 'auto');
  assert.equal(
    value('.signal-kpis-grid', 'grid-template-columns', '(max-width: 47.99rem)'),
    undefined,
  );
  assert.equal(value('.signal-kpi__helper', 'color'), 'var(--signal-kpi-color)');
});
