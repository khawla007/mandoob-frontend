import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const source = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');
const list = source('src/app/admin/companies/page.tsx');
const create = source('src/app/admin/companies/new/page.tsx');
const detail = source('src/app/admin/companies/[id]/page.tsx');
const onboarding = source('src/app/admin/companies/[id]/onboarding/[section]/page.tsx');
const css = source('src/app/globals.css');

test('all rendered Companies surfaces opt into the inspected operational workspace', () => {
  for (const page of [list, create, detail, onboarding]) {
    assert.match(
      page,
      /admin-management-signal admin-operational-workspace company-management-workspace/u,
    );
  }

  assert.match(list, /className="admin-operational-heading"/u);
  assert.match(create, /className="admin-operational-heading"/u);
  assert.match(detail, /admin-operational-heading/u);
});

test('Companies controls receive scoped target geometry without changing form behavior', () => {
  assert.match(css, /\.company-management-workspace/u);
  assert.match(css, /input:not\(\[type='hidden'\]\)/u);
  assert.match(css, /min-height:\s*2\.75rem/u);
  assert.match(
    css,
    /\.dark \.company-management-workspace button\[data-variant='destructive'\][^{]*\{[^}]*color:\s*color-mix\(in oklch, var\(--destructive\) 65%, white\)/u,
  );

  assert.doesNotMatch(css, /\.company-management-workspace[^}]*display:\s*none/u);
  assert.doesNotMatch(css, /\.company-management-workspace[^}]*pointer-events:\s*none/u);
});

test('assignment history exposes the Table scroll area to keyboard users', () => {
  assert.match(detail, /<Table scrollAreaLabel=\{t\('history\.tableLabel'\)\}>/u);
  assert.doesNotMatch(detail, /overflow-x-auto" role="region"/u);
});
