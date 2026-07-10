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
  content_html: '<p>Hello</p>', hero_settings: {
    backgroundColor: '#ffffff', overlayColor: '#000000', overlayOpacity: 0,
    headingAlignment: 'center', textAlignment: 'center', buttonAlignment: 'center',
  },
  background_image_media_id: null, status: 'draft', published_at: null, scheduled_for: null,
  meta_title: null, meta_description: null, canonical_url: null, noindex: false,
  schema_markup: null, script_head: null, script_body_start: null, script_body_end: null,
  created_by: 'creator', updated_by: 'updater', deleted_at: null,
  created_at: '2026-07-01T00:00:00.000Z', updated_at: '2026-07-02T00:00:00.000Z',
  ...overrides,
});

function stub(seed: Record<string, Row[]> = {}, options: { duplicate?: boolean; queryError?: { message: string; code?: string } } = {}) {
  const tables = new Map(Object.entries(seed).map(([name, rows]) => [name, rows.map((r) => ({ ...r }))]));
  const calls: Array<{ table: string; method: string; args: unknown[] }> = [];
  const getRows = (table: string) => tables.get(table) ?? (tables.set(table, []), tables.get(table)!);
  function from(table: string) {
    let op = 'select'; let payload: Row = {}; const filters: Array<(r: Row) => boolean> = [];
    const orders: Array<{ column: string; ascending: boolean }> = []; let bounds: [number, number] | null = null;
    let selectedColumns: string | undefined;
    const builder = {
      select(...args: unknown[]) { selectedColumns = args[0] as string | undefined; calls.push({ table, method: 'select', args }); return builder; },
      eq(column: string, value: unknown) { filters.push((r) => r[column] === value); calls.push({ table, method: 'eq', args: [column, value] }); return builder; },
      is(column: string, value: unknown) { filters.push((r) => r[column] === value); calls.push({ table, method: 'is', args: [column, value] }); return builder; },
      lte(column: string, value: unknown) { filters.push((r) => String(r[column]) <= String(value)); calls.push({ table, method: 'lte', args: [column, value] }); return builder; },
      order(column: string, options: { ascending?: boolean } = {}) { orders.push({ column, ascending: options.ascending ?? true }); calls.push({ table, method: 'order', args: [column, options] }); return builder; },
      range(from: number, to: number) { bounds = [from, to]; calls.push({ table, method: 'range', args: [from, to] }); return builder; },
      insert(value: Row) { op = 'insert'; payload = value; calls.push({ table, method: 'insert', args: [value] }); return builder; },
      update(value: Row) { op = 'update'; payload = value; calls.push({ table, method: 'update', args: [value] }); return builder; },
      async maybeSingle() { const result = apply(); return { data: result.data[0] ?? null, error: result.error }; },
      async single() { const result = apply(); return { data: result.data[0] ?? null, error: result.error ?? (result.data[0] ? null : { message: 'JSON object requested, multiple (or no) rows returned', code: 'PGRST116' }) }; },
      then(resolve: (v: unknown) => void) { const result = apply(); resolve({ data: result.data, error: result.error, count: result.count }); },
    };
    function apply(): { data: Row[]; error: { message: string; code?: string } | null; count: number } {
      if (options.duplicate && (op === 'insert' || op === 'update')) return { data: [], error: { message: 'duplicate key', code: '23505' }, count: 0 };
      if (options.queryError) return { data: [], error: options.queryError, count: 0 };
      let rows = getRows(table).filter((r) => filters.every((f) => f(r)));
      if (op === 'insert') { const row = pageRow({ id: 'page-new', ...payload }); getRows(table).push(row); rows = [row]; }
      if (op === 'update') { rows.forEach((r) => Object.assign(r, payload)); }
      const count = rows.length;
      rows = [...rows].sort((a, b) => { for (const order of orders) { const cmp = String(a[order.column]).localeCompare(String(b[order.column])); if (cmp) return order.ascending ? cmp : -cmp; } return 0; });
      if (bounds) rows = rows.slice(bounds[0], bounds[1] + 1);
      if (selectedColumns && selectedColumns !== '*') {
        const columns = selectedColumns.split(',').map((column) => column.trim());
        rows = rows.map((row) => Object.fromEntries(columns.map((column) => [column, row[column]])));
      }
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

test('rejects malformed CMS page rows with a safe API error', () => {
  assert.throws(
    () => mapCmsPageRow(pageRow({ status: 'not-a-status', noindex: 'false' })),
    (error: unknown) =>
      error instanceof ApiError && error.code === 'INVALID_DATA' && error.status === 500,
  );
});

test('admin list safely rejects malformed list rows', async () => {
  const db = stub({ cms_pages: [pageRow({ title: null })] });
  await assert.rejects(
    () => listAdminCmsPages({}, { supabase: db }),
    (error: unknown) => error instanceof ApiError && error.code === 'INVALID_DATA',
  );
});

test('query failures use fixed public messages without leaking database details', async () => {
  const secret = 'relation cms_pages password=server-secret';
  const db = stub({}, { queryError: { message: secret, code: 'XX000' } });
  await assert.rejects(
    () => listAdminCmsPages({}, { supabase: db }),
    (error: unknown) => error instanceof ApiError && error.message === 'Unable to list CMS pages' && !error.message.includes(secret),
  );
});

test('admin list clamps page and uses exact count, range, and deterministic ordering', async () => {
  const db = stub({ cms_pages: Array.from({ length: 10 }, (_, i) => pageRow({ id: `p-${i}`, updated_at: `2026-07-${String(i + 1).padStart(2, '0')}T00:00:00.000Z` })) });
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
  assert.ok(db.calls.some((c) => c.table === 'blog_media' && c.method === 'is' && c.args[0] === 'deleted_at' && c.args[1] === null));
});

test('upsert persists and round-trips all script slots without executing them', async () => {
  const db = stub();
  const scripts = {
    scriptHead: '<script>window.headSlot = true</script>',
    scriptBodyStart: '<script>window.startSlot = true</script>',
    scriptBodyEnd: '<script>window.endSlot = true</script>',
  };
  const result = await upsertCmsPage(
    { title: 'Scripts', slug: 'scripts', contentJson: {}, contentHtml: '', heroSettings: {}, status: 'draft', ...scripts },
    { id: 'admin-1', role: 'admin' },
    { supabase: db },
  );
  const insert = db.calls.find((call) => call.method === 'insert')?.args[0] as Row;
  assert.deepEqual(
    { script_head: insert.script_head, script_body_start: insert.script_body_start, script_body_end: insert.script_body_end },
    { script_head: scripts.scriptHead, script_body_start: scripts.scriptBodyStart, script_body_end: scripts.scriptBodyEnd },
  );
  assert.deepEqual(
    { scriptHead: result.scriptHead, scriptBodyStart: result.scriptBodyStart, scriptBodyEnd: result.scriptBodyEnd },
    scripts,
  );
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
  const duplicate = stub({}, { duplicate: true });
  await assert.rejects(() => upsertCmsPage({ title: 'P', slug: 'p', contentJson: {}, contentHtml: '', status: 'draft' }, { id: 'a', role: 'admin' }, { supabase: duplicate }), (e: unknown) => e instanceof ApiError && e.code === 'DUPLICATE_SLUG');
});

test('upsert rejects deleted background media without persisting the page', async () => {
  const db = stub({ blog_media: [{ id: 'media-deleted', public_url: 'https://cdn.example/deleted.jpg', deleted_at: '2026-07-01T00:00:00.000Z' }] });
  await assert.rejects(
    () => upsertCmsPage({ title: 'P', slug: 'p', contentJson: {}, contentHtml: '', backgroundImageMediaId: 'media-deleted', status: 'draft' }, { id: 'a', role: 'admin' }, { supabase: db }),
    (error: unknown) => error instanceof ApiError && error.code === 'INVALID_MEDIA',
  );
  assert.equal(db.calls.some((c) => c.table === 'cms_pages' && c.method === 'insert'), false);
});

test('soft delete records actor and timestamp', async () => {
  const db = stub({ cms_pages: [pageRow()] });
  await softDeleteCmsPage('page-1', { id: 'admin-3', role: 'admin' }, { supabase: db });
  const update = db.calls.find((c) => c.method === 'update')?.args[0] as Row;
  assert.equal(update.updated_by, 'admin-3'); assert.equal(typeof update.deleted_at, 'string');
});

test('update maps missing and already-deleted page IDs to NOT_FOUND', async () => {
  for (const db of [stub(), stub({ cms_pages: [pageRow({ deleted_at: '2026-07-01T00:00:00.000Z' })] })]) {
    await assert.rejects(
      () => upsertCmsPage({ id: 'page-1', title: 'Page', slug: 'page', contentJson: {}, contentHtml: '', status: 'draft' }, { id: 'admin', role: 'admin' }, { supabase: db }),
      (error: unknown) => error instanceof ApiError && error.code === 'NOT_FOUND' && error.status === 404,
    );
  }
});

test('soft delete maps missing and already-deleted page IDs to NOT_FOUND', async () => {
  for (const db of [stub(), stub({ cms_pages: [pageRow({ deleted_at: '2026-07-01T00:00:00.000Z' })] })]) {
    await assert.rejects(
      () => softDeleteCmsPage('page-1', { id: 'admin', role: 'admin' }, { supabase: db }),
      (error: unknown) => error instanceof ApiError && error.code === 'NOT_FOUND' && error.status === 404,
    );
  }
});

test('public lookup applies published, date, and deletion filters', async () => {
  const db = stub({ cms_pages: [pageRow({ status: 'published', published_at: '2026-01-01T00:00:00.000Z' })] });
  assert.equal((await getPublishedCmsPageBySlug('hello', { supabase: db, now: new Date('2026-07-01T00:00:00.000Z') }))?.slug, 'hello');
  assert.ok(db.calls.some((c) => c.method === 'eq' && c.args[0] === 'status' && c.args[1] === 'published'));
  assert.ok(db.calls.some((c) => c.method === 'lte' && c.args[0] === 'published_at'));
  const projection = db.calls.find((c) => c.method === 'select')?.args[0] as string;
  assert.equal(projection.includes('created_by'), false);
  assert.equal(projection.includes('updated_by'), false);
  assert.equal(projection.includes('deleted_at'), false);
});

test('published sitemap list returns only public columns in deterministic order', async () => {
  const db = stub({ cms_pages: [pageRow({ status: 'published', published_at: '2026-01-01T00:00:00.000Z' })] });
  const pages = await listPublishedCmsPages({ supabase: db, now: new Date('2026-07-01T00:00:00.000Z') });
  assert.deepEqual(pages, [{ slug: 'hello', updatedAt: '2026-07-02T00:00:00.000Z', noindex: false }]);
  assert.ok(db.calls.some((c) => c.method === 'select' && c.args[0] === 'slug, updated_at, noindex'));
});

test('published sitemap list rejects malformed projection rows', async () => {
  for (const bad of [{ slug: null }, { updated_at: null }, { noindex: 'false' }]) {
    const db = stub({ cms_pages: [pageRow({ status: 'published', published_at: '2026-01-01T00:00:00.000Z', ...bad })] });
    await assert.rejects(
      () => listPublishedCmsPages({ supabase: db, now: new Date('2026-07-01T00:00:00.000Z') }),
      (error: unknown) => error instanceof ApiError && error.code === 'INVALID_DATA',
    );
  }
});
