import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

async function readMigration(): Promise<string> {
  const candidates = [
    path.resolve(process.cwd(), '../supabase/migrations/0046_seed_legal_cms_pages.sql'),
    path.resolve(process.cwd(), '../../../supabase/migrations/0046_seed_legal_cms_pages.sql'),
  ];

  for (const candidate of candidates) {
    try {
      return await readFile(candidate, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }

  throw new Error('Could not locate migration 0046_seed_legal_cms_pages.sql');
}

test('legal CMS migration seeds all canonical published pages idempotently', async () => {
  const sql = await readMigration();

  for (const slug of ['privacy', 'terms', 'pdpl', 'trust']) {
    assert.match(sql, new RegExp(`'${slug}'`));
    assert.match(sql, new RegExp(`https://mandoob\\.ae/legal/${slug}`));
  }

  assert.match(sql, /content_json/);
  assert.match(sql, /content_html/);
  assert.match(sql, /'published'/);
  assert.match(sql, /published_at/);
  assert.match(sql, /on conflict \(slug\) where deleted_at is null do update/i);
  assert.equal(
    sql.match(/"backgroundColor": "#ffffff"/g)?.length,
    4,
    'every seeded page must use the complete default hero settings shape',
  );
});

test('legal CMS migration preserves editable content from every former document', async () => {
  const sql = await readMigration();

  for (const preservedText of [
    'Data we collect',
    'Subscriptions and fees',
    'Data residency',
    'Certifications',
    'Last updated: 22 May 2026',
  ]) {
    assert.match(sql, new RegExp(preservedText));
  }

  assert.match(sql, /"type": "doc"/);
  assert.match(sql, /<h2>Data we collect<\/h2>/);
  assert.match(sql, /<h2>Subscriptions and fees<\/h2>/);
  assert.match(sql, /<h2>Data residency<\/h2>/);
  assert.match(sql, /<h2>Certifications<\/h2>/);
});
