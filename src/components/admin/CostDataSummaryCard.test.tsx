import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import React from 'react';
import test from 'node:test';

const reactServer = '__SERVER_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE' in React;
const renderTest = reactServer ? ((() => undefined) as unknown as typeof test) : test;
if (reactServer) {
  test('Cost Data summary render contracts run under the client React condition', () => {
    const result = spawnSync(
      process.execPath,
      ['--import', 'tsx', fileURLToPath(import.meta.url)],
      {
        encoding: 'utf8',
      },
    );
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  });
}

renderTest('zero summaries remain visible without decorative positive marks', async () => {
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { CostDataSummaryCard } = await import('./CostDataSummaryCard');
  const html = renderToStaticMarkup(
    <CostDataSummaryCard label="Authorities" value="0" badge="0 expired" tone="info" />,
  );
  assert.match(html, />0</u);
  assert.match(html, /0 expired/u);
  assert.doesNotMatch(html, /<svg|<canvas|data-kpi-mark|signal-kpi__bars|LIVE/u);
});

renderTest(
  'large localized values and long Arabic labels remain complete and escaped',
  async () => {
    const { renderToStaticMarkup } = await import('react-dom/server');
    const { CostDataSummaryCard } = await import('./CostDataSummaryCard');
    for (const locale of ['en', 'ar']) {
      const value = new Intl.NumberFormat(locale).format(1234567890);
      const label = 'عدد صفوف الرسوم المستخدمة في عروض الأسعار '.repeat(8) + '<script>bad</script>';
      const html = renderToStaticMarkup(
        <CostDataSummaryCard label={label} value={value} tone="success" />,
      );
      assert.ok(html.includes(value));
      assert.match(html, /&lt;script&gt;bad&lt;\/script&gt;/u);
      assert.match(html, /tabular-nums/u);
      assert.doesNotMatch(html, /truncate|line-clamp|<script>/u);
    }
  },
);
