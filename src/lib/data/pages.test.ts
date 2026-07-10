import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ApiError } from '@/lib/errors';
import {
  getAdminCmsPage,
  getPublishedCmsPageBySlug,
  listAdminCmsPages,
  listPublishedCmsPages,
  mapCmsPageRow,
  softDeleteCmsPage,
  upsertCmsPage,
} from '@/lib/data/pages';

type Row = Record<string, unknown>;

const pageRow = (overrides: Row = {}): Row => ({
  id: 'page-1', slug: 'hello', title: 'Hello', content_json: { type: 'doc' },
  content_html: '<p>Hello</p>', hero_settings: { backgroundColor: '#ffffff' },
  background_image_media_id: null, status: 'draft', published_at: null, scheduled_for: null,
  meta_title: null, meta_description: null, canonical_url: null, noindex: false,
  schema_markup: null, created_by: 'creator', updated_by: 'updater', deleted_at: null,
  created_at: '2026-07-01T00:00:00.000Z', updated_at: '2026-07-02T00:00:00.000Z',
  ...overrides,
});

function stub(seed: Record<string, Row[]> = {}, duplicate = false) {
  const tables = new Map(Object.entries(seed).map(([name, rows]) => [name, rows.map((r) => ({ ...r }))]));
  const calls: Array<{ table: string; method: string; args: unknown[] }> = [];
  const getRows = (table: string) => tables.get(table) ?? (tables.set(table, []), tables.get(table)!);
  function from(table: string) {
    let op = 'select'; let payload: Row = {}; const filters: Array<(r: Row) => boolean> = [];
    const orders: Array<{ column: string; ascending: boolean }> = []; let bounds: [number, number] | null = null;
    const builder = {
      select(...args: unknown[]) { calls.push({ table, method: 'select', args }); return builder; },
      eq(column: string, value: unknown) { filters.push((r) => r[column] === value); calls.push({ table, method: 'eq', args: [column, value] }); return builder; },
      is(column: string, value: unknown) { filters.push((r) => r[column] === value); calls.push({ table, method: 'is', args: [column, value] }); return builder; },
      lte(column: string, value: unknown) { filters.push((r) => String(r[column]) <= String(value)); calls.push({ table, method: 'lte', args: [column, value] }); return builder; },
      order(column: string, options: { ascending?: boolean } = {}) { orders.push({ column, ascending: options.ascending ?? true }); calls.push({ table, method: 'order', args: [column, options] }); return builder; },
      range(from: number, to: number) { bounds = [from, to]; calls.push({ table, method: 'range', args: [from, to] }); return builder; },
      insert(value: Row) { op = 'insert'; payload = value; calls.push({ table, method: 'insert', args: [value] }); return builder; },
      update(value: Row) { op = 'update'; payload = value; calls.push({ table, method: 'update', args: [value] }); return builder; },
      async maybeSingle() { const result = apply(); return { data: result.data[0] ?? null, error: result.error }; },
      async single() { const result = apply(); return { data: result.data[0] ?? null, error: result.error ?? (result.data[0] ? null : { message: 'not found' }) }; },
      then(resolve: (v: unknown) => void) { const result = apply(); resolve({ data: result.data, error: result.error, count: result.count }); },
    };
    function apply(): { data: Row[]; error: { message: string; code?: string } | null; count: number } {
      if (duplicate && (op === 'insert' || op === 'update')) return { data: [], error: { message: 'duplicate key', code: '23505' }, count: 0 };
      let rows = getRows(table).filter((r) => filters.every((f) => f(r)));
      if (op === 'insert') { const row = pageRow({ id: 'page-new', ...payload }); getRows(table).push(row); rows = [row]; }
      if (op === 'update') { rows.forEach((r) => Object.assign(r, payload)); }
      const count = rows.length;
      rows = [...rows].sort((a, b) => { for (const order of orders) { const cmp = String(a[order.column]).localeCompare(String(b[order.column])); if (cmp) return order.ascending ? cmp : -cmp; } return 0; });
      if (bounds) rows = rows.slice(bounds[0], bounds[1] + 1);
      return { data: rows, error: null, count };
    }
    return builder;
  }
  return { from, tables, calls };
}

test('maps database rows into CmsPage properties', () => {
  const mapped = mapCmsPageRow(pageRow({ background_image_media_id: 'media-1' }));
  assert.equal(mapped.backgroundImageMediaId, 'media-1');
  assert.deepEqual(mapped.contentJson, { type: 'doc' });
  assert.equal(mapped.updatedBy, 'updater');
});

test('admin list clamps page and uses exact count, range, and deterministic ordering', async () => {
  const db = stub({ cms_pages: Array.from({ length: 10 }, (_, i) => pageRow({ id: `p-${i}`, updated_at: `2026-07-${String(i + 1).padStart(2, '0')}` })) });
  const result = await listAdminCmsPages({ page: -4, pageSize: 3 }, { supabase: db });
  assert.deepEqual({ total: result.total, page: result.page, pageSize: result.pageSize, size: result.items.length }, { total: 10, page: 1, pageSize: 3, size: 3 });
  assert.ok(db.calls.some((c) => c.method === 'select' && (c.args[1] as { count?: string })?.count === 'exact'));
  assert.deepEqual(db.calls.filter((c) => c.method === 'order').map((c) => c.args[0]), ['updated_at', 'id']);
  assert.deepEqual(db.calls.find((c) => c.method === 'range')?.args, [0, 2]);
});

test('admin lookup returns drafts and excludes soft deleted rows', async () => {
  const db = stub({ cms_pages: [pageRow()] });
  assert.equal((await getAdminCmsPage('page-1', { supabase: db }))?.status, 'draft');
  assert.equal(db.calls.some((c) => c.method === 'eq' && c.args[0] === 'status'), false);
  assert.ok(db.calls.some((c) => c.method === 'is' && c.args[0] === 'deleted_at'));
});

test('upsert sanitizes HTML, records actor IDs, and canonicalizes media URL', async () => {
  const db = stub({ blog_media: [{ id: 'media-1', public_url: 'https://cdn.example/canonical.jpg', deleted_at: null }] });
  const result = await upsertCmsPage({ title: 'Page', slug: 'page', contentJson: {}, contentHtml: '<p onclick="x">Hi</p><script>x</script>', heroSettings: { backgroundImageUrl: 'https://evil.example/x' }, backgroundImageMediaId: 'media-1', status: 'draft' }, { id: 'admin-1', role: 'admin' }, { supabase: db });
  assert.equal(result.heroSettings.backgroundImageUrl, 'https://cdn.example/canonical.jpg');
  assert.equal(result.contentHtml.includes('script'), false);
  const insert = db.calls.find((c) => c.method === 'insert')?.args[0] as Row;
  assert.equal(insert.created_by, 'admin-1'); assert.equal(insert.updated_by, 'admin-1');
});

test('upsert update sets updated actor and clears unbacked client image URL', async () => {
  const db = stub({ cms_pages: [pageRow()] });
  const result = await upsertCmsPage({ id: 'page-1', title: 'Page', slug: 'page', contentJson: {}, contentHtml: '', heroSettings: { backgroundImageUrl: 'https://evil.example/x' }, backgroundImageMediaId: null, status: 'draft' }, { id: 'admin-2', role: 'super_admin' }, { supabase: db });
  assert.equal(result.heroSettings.backgroundImageUrl, null);
  const update = db.calls.find((c) => c.method === 'update')?.args[0] as Row;
  assert.equal(update.updated_by, 'admin-2'); assert.equal(update.created_by, undefined);
});

test('upsert rejects unavailable media and maps duplicate slug errors', async () => {
  const missing = stub();
  await assert.rejects(() => upsertCmsPage({ title: 'P', slug: 'p', contentJson: {}, contentHtml: '', backgroundImageMediaId: 'missing', status: 'draft' }, { id: 'a', role: 'admin' }, { supabase: missing }), (e: unknown) => e instanceof ApiError && e.code === 'INVALID_MEDIA');
  const duplicate = stub({}, true);
  await assert.rejects(() => upsertCmsPage({ title: 'P', slug: 'p', contentJson: {}, contentHtml: '', status: 'draft' }, { id: 'a', role: 'admin' }, { supabase: duplicate }), (e: unknown) => e instanceof ApiError && e.code === 'DUPLICATE_SLUG');
});

test('soft delete records actor and timestamp', async () => {
  const db = stub({ cms_pages: [pageRow()] });
  await softDeleteCmsPage('page-1', { id: 'admin-3', role: 'admin' }, { supabase: db });
  const update = db.calls.find((c) => c.method === 'update')?.args[0] as Row;
  assert.equal(update.updated_by, 'admin-3'); assert.equal(typeof update.deleted_at, 'string');
});

test('public lookup applies published, date, and deletion filters', async () => {
  const db = stub({ cms_pages: [pageRow({ status: 'published', published_at: '2026-01-01T00:00:00.000Z' })] });
  assert.equal((await getPublishedCmsPageBySlug('hello', { supabase: db, now: new Date('2026-07-01T00:00:00.000Z') }))?.slug, 'hello');
  assert.ok(db.calls.some((c) => c.method === 'eq' && c.args[0] === 'status' && c.args[1] === 'published'));
  assert.ok(db.calls.some((c) => c.method === 'lte' && c.args[0] === 'published_at'));
});

test('published sitemap list returns only public columns in deterministic order', async () => {
  const db = stub({ cms_pages: [pageRow({ status: 'published', published_at: '2026-01-01T00:00:00.000Z' })] });
  const pages = await listPublishedCmsPages({ supabase: db, now: new Date('2026-07-01T00:00:00.000Z') });
  assert.deepEqual(pages, [{ slug: 'hello', updatedAt: '2026-07-02T00:00:00.000Z' }]);
  assert.ok(db.calls.some((c) => c.method === 'select' && c.args[0] === 'slug, updated_at'));
});
