import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import postcss, { type Declaration, type Rule } from 'postcss';
import test from 'node:test';

const styles = postcss.parse(readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8'));
const component = readFileSync(
  join(process.cwd(), 'src/components/pro/dashboard/ActionDeck.tsx'),
  'utf8',
);

function declarations(rule: Rule): Map<string, string> {
  return new Map(
    rule.nodes
      .filter((node): node is Declaration => node.type === 'decl')
      .map((declaration) => [declaration.prop, declaration.value]),
  );
}

function exactRule(selector: string): Rule {
  let result: Rule | undefined;
  styles.walkRules((rule) => {
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

function compact(value: string | undefined): string {
  return value?.replace(/\s+/gu, ' ').replace(/\( /gu, '(').replace(/ \)/gu, ')') ?? '';
}

function mix(first: string, second: string, firstWeight: number): string {
  return `#${[1, 3, 5]
    .map((index) =>
      Math.round(
        Number.parseInt(first.slice(index, index + 2), 16) * firstWeight +
          Number.parseInt(second.slice(index, index + 2), 16) * (1 - firstWeight),
      )
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

function grayOklchToHex(value: string): string {
  const lightness = Number(value.match(/^oklch\(([\d.]+) 0 0\)$/u)?.[1]);
  assert.ok(Number.isFinite(lightness), `Unsupported foreground ${value}`);
  const linear = lightness ** 3;
  const encoded = linear <= 0.0031308 ? linear * 12.92 : 1.055 * linear ** (1 / 2.4) - 0.055;
  const channel = Math.round(encoded * 255)
    .toString(16)
    .padStart(2, '0');
  return `#${channel}${channel}${channel}`;
}

function lastDeclaration(selector: string, property: string): string {
  let result = '';
  styles.walkRules((rule) => {
    if (!rule.selectors.includes(selector)) return;
    const value = declarations(rule).get(property);
    if (value) result = value;
  });
  assert.ok(result, `Missing ${property} in ${selector}`);
  return result;
}

test('dark priority cards expose semantic title, detail, meta, and urgency colors', () => {
  for (const role of ['title', 'detail', 'meta']) {
    assert.match(component, new RegExp(`className="signal-action-card__${role}\\b`, 'u'));
  }
  assert.doesNotMatch(
    component,
    /signal-action-card__(?:title|detail|meta)[^"]*\btext-foreground(?:\/70)?\b/u,
  );

  const lightCard = declarations(exactRule('.signal-action-card'));
  assert.equal(lightCard.get('--signal-action-title'), 'var(--foreground)');
  assert.equal(
    lightCard.get('--signal-action-secondary'),
    'color-mix(in oklab, var(--foreground) 70%, transparent)',
  );
  assert.equal(
    declarations(exactRule('.signal-action-card__title')).get('color'),
    'var(--signal-action-title)',
  );
  for (const selector of ['.signal-action-card__detail', '.signal-action-card__meta']) {
    assert.equal(declarations(exactRule(selector)).get('color'), 'var(--signal-action-secondary)');
  }
  assert.equal(
    declarations(exactRule('.signal-action-card__urgency')).get('color'),
    'var(--signal-action-title)',
  );

  const darkCard = declarations(exactRule('.dark .signal-action-card'));
  assert.equal(darkCard.get('--signal-action-title'), '#f5f1ea');
  assert.equal(darkCard.get('--signal-action-secondary'), '#c7bfb8');
  assert.equal(
    declarations(exactRule('.dark .signal-action-card__urgency')).get('color'),
    'var(--signal-action-color)',
  );
});

test('every light priority-card tone meets text and visible-boundary contrast thresholds', () => {
  const foreground = grayOklchToHex(lastDeclaration(':root', '--foreground'));
  const urgencyDeclaration = declarations(exactRule('.signal-action-card__urgency')).get('color');

  for (const tone of ['coral', 'sand', 'blue']) {
    const values = declarations(exactRule(`.signal-action-card--${tone}`));
    const colors = (values.get('background') ?? '').match(/#[0-9a-f]{6}/giu) ?? [];
    assert.equal(colors.length, 2, `${tone} must retain two explicit light gradient endpoints`);
    const accent = values.get('--signal-action-color') ?? '';
    const urgency = urgencyDeclaration === 'var(--signal-action-title)' ? foreground : accent;
    assert.equal(values.get('border-color'), 'var(--signal-action-border)');

    for (const background of colors) {
      const secondary = mix(foreground, background, 0.7);
      for (const [role, color] of [
        ['title', foreground],
        ['detail', secondary],
        ['meta', secondary],
        ['urgency', urgency],
      ]) {
        const ratio = contrast(color, background);
        assert.ok(ratio >= 4.5, `${tone} light ${role} contrast was ${ratio.toFixed(2)}:1`);
      }

      const border = values.get('--signal-action-border') ?? accent;
      const borderRatio = contrast(border, background);
      assert.ok(borderRatio >= 3, `${tone} light border contrast was ${borderRatio.toFixed(2)}:1`);
    }
  }
});

test('every dark priority-card tone meets text and visible-boundary contrast thresholds', () => {
  const card = declarations(exactRule('.dark .signal-action-card'));
  const dashboard = declarations(exactRule(".dark [data-nav-kind='pro']"));
  const title = card.get('--signal-action-title') ?? '';
  const secondary = card.get('--signal-action-secondary') ?? '';
  const surfaceEnd = dashboard.get('--signal-panel-surface') ?? '';

  for (const tone of ['coral', 'sand', 'blue']) {
    const values = declarations(exactRule(`.dark .signal-action-card--${tone}`));
    const surface = values.get('--signal-action-surface') ?? '';
    const urgency = values.get('--signal-action-color') ?? '';
    assert.equal(
      compact(values.get('background')),
      'linear-gradient(145deg, var(--signal-action-surface), var(--signal-panel-surface))',
    );
    assert.equal(
      compact(values.get('border-color')),
      'color-mix(in srgb, var(--signal-action-color) 60%, var(--signal-action-surface))',
    );

    for (const [role, foreground] of [
      ['title', title],
      ['detail', secondary],
      ['meta', secondary],
      ['urgency', urgency],
    ]) {
      for (const background of [surface, surfaceEnd]) {
        const ratio = contrast(foreground, background);
        assert.ok(ratio >= 4.5, `${tone} ${role} contrast was ${ratio.toFixed(2)}:1`);
      }
    }

    const boundary = mix(urgency, surface, 0.6);
    for (const background of [surface, surfaceEnd]) {
      const boundaryRatio = contrast(boundary, background);
      assert.ok(boundaryRatio >= 3, `${tone} border contrast was ${boundaryRatio.toFixed(2)}:1`);
    }
  }
});
