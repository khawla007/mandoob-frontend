import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import postcss, { type AtRule, type Declaration, type Rule } from 'postcss';
import test from 'node:test';

const source = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8');
const css = postcss.parse(source);
const marker = css.nodes.findIndex(
  (node) => node.type === 'comment' && node.text.includes('PRO Document Center'),
);
const endMarker = css.nodes.findIndex(
  (node, index) =>
    index > marker && node.type === 'comment' && node.text === 'END PRO Document Center',
);
assert.notEqual(marker, -1, 'Missing Document Center CSS marker');
assert.notEqual(endMarker, -1, 'Missing Document Center CSS end marker');
const scoped = postcss.root({ nodes: css.nodes.slice(marker + 1, endMarker) });

function declarations(rule: Rule): Map<string, string> {
  return new Map(
    rule.nodes
      .filter((node): node is Declaration => node.type === 'decl')
      .map((declaration) => [declaration.prop, declaration.value]),
  );
}

function exactRule(selector: string): Rule {
  let result: Rule | undefined;
  scoped.walkRules((rule) => {
    if (!result && rule.selectors.includes(selector)) result = rule;
  });
  assert.ok(result, `Missing CSS rule ${selector}`);
  return result;
}

function channel(value: number): number {
  const unit = value / 255;
  return unit <= 0.04045 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  assert.match(hex, /^#[0-9a-f]{6}$/iu);
  const rgb = [hex.slice(1, 3), hex.slice(3, 5), hex.slice(5, 7)].map((part) =>
    Number.parseInt(part, 16),
  );
  return 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2]);
}

function contrast(first: string, second: string): number {
  const values = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

test('all summary variants expose testable light and dark surfaces with AA helper contrast', () => {
  const root = declarations(exactRule('.document-center'));
  const foregrounds: Record<'light' | 'dark', string> = {
    light: root.get('--document-summary-muted-light') ?? '',
    dark: root.get('--document-summary-muted-dark') ?? '',
  };
  assert.ok(foregrounds.light);
  assert.ok(foregrounds.dark);

  for (const variant of ['info', 'review', 'success', 'urgent', 'expiry', 'overdue']) {
    const values = declarations(exactRule(`.document-center__summary--${variant}`));
    for (const mode of ['light', 'dark'] as const) {
      const surface = values.get(`--document-summary-surface-${mode}`);
      assert.ok(surface, `Missing ${mode} surface for ${variant}`);
      assert.ok(
        contrast(foregrounds[mode], surface) >= 4.5,
        `${variant} ${mode} helper text must meet WCAG AA`,
      );
    }
  }

  const helper = exactRule('.document-center__summary .text-muted-foreground');
  assert.equal(declarations(helper).get('color'), 'var(--document-summary-muted-light)');
  assert.equal(declarations(helper).get('opacity'), '1');
  const darkHelper = exactRule('.dark .document-center__summary .text-muted-foreground');
  assert.equal(declarations(darkHelper).get('color'), 'var(--document-summary-muted-dark)');
});

test('opaque focus tokens keep at least 3:1 contrast across every summary surface', () => {
  const root = declarations(exactRule('.document-center'));
  const focus = {
    light: root.get('--document-focus-light') ?? '',
    dark: root.get('--document-focus-dark') ?? '',
  };
  assert.match(focus.light, /^#[0-9a-f]{6}$/iu);
  assert.match(focus.dark, /^#[0-9a-f]{6}$/iu);
  for (const variant of ['info', 'review', 'success', 'urgent', 'expiry', 'overdue']) {
    const values = declarations(exactRule(`.document-center__summary--${variant}`));
    for (const mode of ['light', 'dark'] as const) {
      const surface = values.get(`--document-summary-surface-${mode}`) ?? '';
      assert.ok(contrast(focus[mode], surface) >= 3, `${variant} ${mode} focus contrast`);
    }
  }
  const summaryFocus = declarations(exactRule('.document-center__summary:focus-visible'));
  assert.equal(summaryFocus.get('outline'), '3px solid var(--document-focus)');
});

test('Document Center containment leaves horizontal scrolling only to the queue', () => {
  const root = declarations(exactRule('.document-center'));
  assert.equal(root.has('overflow-x'), false);

  const horizontalOverflow: Array<{ selector: string; value: string }> = [];
  scoped.walkRules((rule) => {
    rule.walkDecls('overflow-x', (declaration) => {
      horizontalOverflow.push({ selector: rule.selector, value: declaration.value });
    });
  });
  assert.deepEqual(horizontalOverflow, [
    { selector: '.document-center__queue-scroll', value: 'auto' },
  ]);
  assert.equal(declarations(exactRule('.document-center__queue-scroll')).get('max-width'), '100%');
});

test('scoped focus, mobile targets, variants, and reduced motion are concrete AST contracts', () => {
  for (const variant of ['info', 'review', 'success', 'urgent', 'expiry', 'overdue']) {
    exactRule(`.document-center__summary--${variant}`);
    exactRule(`.document-center__summary--${variant} .document-center__summary-pattern`);
  }

  const focusRules: Rule[] = [];
  scoped.walkRules((rule) => {
    if (rule.selector.includes(':focus-visible')) focusRules.push(rule);
  });
  assert.ok(focusRules.length >= 2);
  assert.ok(
    focusRules.some((rule) => {
      const values = declarations(rule);
      return values.has('outline') || values.has('box-shadow');
    }),
  );
  const portalFocus = exactRule(
    '.document-center-dialog :is(button, input, select, textarea):focus-visible',
  );
  assert.equal(declarations(portalFocus).get('outline'), '3px solid var(--document-focus)');

  const shine = declarations(exactRule('.document-center__summary::after'));
  assert.equal(shine.get('z-index'), '0');
  const content = declarations(exactRule('.document-center__summary > .relative'));
  assert.equal(content.get('z-index'), '1');

  let mobile: AtRule | undefined;
  scoped.walkAtRules('media', (rule) => {
    if (rule.params.includes('max-width: 47.99rem')) mobile = rule;
  });
  assert.ok(mobile, 'Missing mobile Document Center media query');
  for (const selector of [
    '.document-center :is(button, a, input, select, textarea, summary)',
    '.document-center-dialog :is(button, input, select, textarea)',
  ]) {
    let target: Rule | undefined;
    mobile.walkRules((rule) => {
      if (rule.selectors.includes(selector)) target = rule;
    });
    assert.ok(target, `Missing mobile target rule for ${selector}`);
    assert.equal(declarations(target).get('min-block-size'), '2.75rem');
    assert.equal(declarations(target).get('min-inline-size'), '2.75rem');
  }

  let reduced: AtRule | undefined;
  scoped.walkAtRules('media', (rule) => {
    if (rule.params === '(prefers-reduced-motion: reduce)') reduced = rule;
  });
  assert.ok(reduced);
  let shineDisabled = false;
  reduced.walkRules((rule) => {
    if (
      rule.selectors.includes('.document-center__summary::after') &&
      declarations(rule).get('display') === 'none'
    ) {
      shineDisabled = true;
    }
  });
  assert.equal(shineDisabled, true);
});

test('all portaled dialogs are viewport-bounded, scrollable, and logically closed', () => {
  const dialog = declarations(exactRule('.document-center-dialog'));
  assert.equal(dialog.get('max-block-size'), 'calc(100dvh - 2rem)');
  assert.equal(dialog.get('overflow-y'), 'auto');
  const close = declarations(exactRule(".document-center-dialog > [data-slot='dialog-close']"));
  assert.equal(close.get('inset-inline-end'), '0.5rem');
  assert.equal(close.get('right'), 'auto');
});

test('the scoped AST is bounded by an explicit Document Center end marker', () => {
  assert.match(source, /\/\* END PRO Document Center \*\//u);
});

test('every rule after the marker remains scoped to the Document Center or its portal', () => {
  scoped.walkRules((rule) => {
    for (const selector of rule.selectors) {
      assert.ok(
        selector.includes('.document-center'),
        `Unscoped selector leaked from Document Center block: ${selector}`,
      );
    }
  });
});
