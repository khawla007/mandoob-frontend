import assert from 'node:assert/strict';
import { test } from 'node:test';

import { sanitizeBlogHtml } from '@/lib/blog/render';
import { normalizeBlogSlug } from '@/lib/blog/slug';
import { isBlogPostPublic } from '@/lib/blog/visibility';
import { ApiError } from '@/lib/errors';
import {
  createBlogTerm,
  getAdminBlogPost,
  mapBlogMediaRow,
  mapBlogPostRow,
  mapBlogTermRow,
  uploadBlogMedia,
  upsertBlogPost,
} from '@/lib/data/blog';
import {
  MAX_GALLERY_IMAGES,
  blogPostInputSchema,
  blogTermInputSchema,
} from '@/lib/validation/blog';

type Row = Record<string, unknown>;

function pngBytes(): Uint8Array {
  return Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
    'base64',
  );
}

function createBlogSupabaseStub(
  seed: Record<string, Row[]> = {},
  options: { failInsertTable?: string } = {},
) {
  const tables = new Map<string, Row[]>(
    Object.entries(seed).map(([table, rows]) => [table, rows.map((row) => ({ ...row }))]),
  );
  const uploads: Array<{ bucket: string; path: string; data: Uint8Array; contentType: string }> = [];
  const removals: Array<{ bucket: string; paths: string[] }> = [];

  function rows(table: string): Row[] {
    if (!tables.has(table)) tables.set(table, []);
    return tables.get(table)!;
  }

  function nextRow(table: string, payload: Row): Row {
    const now = '2026-07-01T10:00:00.000Z';
    if (table === 'blog_posts') {
      return {
        id: '00000000-0000-4000-8000-000000000100',
        deleted_at: null,
        created_at: now,
        updated_at: now,
        ...payload,
      };
    }
    if (table === 'blog_media') {
      return {
        id: '00000000-0000-4000-8000-000000000200',
        created_at: now,
        updated_at: now,
        ...payload,
      };
    }
    return { id: `${table}-${rows(table).length + 1}`, ...payload };
  }

  function from(table: string) {
    const state: { filters: Row; payload: unknown; op: 'select' | 'insert' | 'update' | 'delete' } = {
      filters: {},
      payload: null,
      op: 'select',
    };
    const builder = {
      select: () => builder,
      order: () => builder,
      is(column: string, value: unknown) {
        state.filters[column] = value;
        return builder;
      },
      not: () => builder,
      lte: () => builder,
      eq(column: string, value: unknown) {
        state.filters[column] = value;
        return builder;
      },
      insert(payload: unknown) {
        state.op = 'insert';
        state.payload = payload;
        return builder;
      },
      update(payload: unknown) {
        state.op = 'update';
        state.payload = payload;
        return builder;
      },
      delete() {
        state.op = 'delete';
        return builder;
      },
      async maybeSingle() {
        const error = currentError();
        if (error) return { data: null, error };
        const result = applyQuery()[0] ?? null;
        return { data: result, error: null };
      },
      async single() {
        const error = currentError();
        if (error) return { data: null, error };
        const result = applyQuery()[0] ?? null;
        return { data: result, error: result ? null : { message: 'not found' } };
      },
      then(resolve: (value: { data: unknown; error: { message: string } | null }) => void) {
        const error = currentError();
        resolve({ data: error ? null : applyQuery(), error });
      },
    };

    function currentError(): { message: string } | null {
      if (state.op === 'insert' && options.failInsertTable === table) {
        return { message: `${table} insert failed` };
      }
      return null;
    }

    function matches(row: Row): boolean {
      return Object.entries(state.filters).every(([column, value]) => row[column] === value);
    }

    function applyQuery(): Row[] {
      if (state.op === 'insert') {
        const payloads = Array.isArray(state.payload) ? state.payload : [state.payload];
        const inserted = payloads.map((payload) => nextRow(table, payload as Row));
        rows(table).push(...inserted);
        return inserted;
      }
      if (state.op === 'update') {
        const updated = rows(table).filter(matches);
        updated.forEach((row) => Object.assign(row, state.payload as Row));
        return updated;
      }
      if (state.op === 'delete') {
        const existing = rows(table);
        const kept = existing.filter((row) => !matches(row));
        const removed = existing.filter(matches);
        tables.set(table, kept);
        return removed;
      }
      return rows(table).filter(matches);
    }

    return builder;
  }

  return {
    tables,
    uploads,
    removals,
    from,
    storage: {
      from(bucket: string) {
        return {
          async upload(path: string, data: Uint8Array, options: { contentType: string }) {
            uploads.push({ bucket, path, data, contentType: options.contentType });
            return { error: null };
          },
          getPublicUrl(path: string) {
            return { data: { publicUrl: `https://storage.example/${path}` } };
          },
          async remove(paths: string[]) {
            removals.push({ bucket, paths });
            return { error: null };
          },
        };
      },
    },
  };
}

test('normalizeBlogSlug lowercases, trims, and removes unsafe characters', () => {
  assert.equal(normalizeBlogSlug('  Hello, Dubai PRO! 2026  '), 'hello-dubai-pro-2026');
  assert.equal(normalizeBlogSlug('Launch___Week / Updates'), 'launch-week-updates');
});

test('normalizeBlogSlug falls back to post when no safe characters remain', () => {
  assert.equal(normalizeBlogSlug(' !!! '), 'post');
});

test('isBlogPostPublic only allows non-deleted published posts at or before now', () => {
  const now = new Date('2026-07-01T10:00:00.000Z');
  const published = {
    status: 'published',
    publishedAt: '2026-07-01T09:59:59.000Z',
    deletedAt: null,
  };

  assert.equal(isBlogPostPublic(published, now), true);
  assert.equal(isBlogPostPublic({ ...published, status: 'draft' }, now), false);
  assert.equal(isBlogPostPublic({ ...published, status: 'scheduled' }, now), false);
  assert.equal(isBlogPostPublic({ ...published, status: 'archived' }, now), false);
  assert.equal(
    isBlogPostPublic({ ...published, publishedAt: '2026-07-01T10:00:01.000Z' }, now),
    false,
  );
  assert.equal(isBlogPostPublic({ ...published, deletedAt: '2026-07-01T09:00:00.000Z' }, now), false);
});

test('sanitizeBlogHtml strips scripts and unsafe event handlers', () => {
  const sanitized = sanitizeBlogHtml(
    '<p onclick="alert(1)">Hi<script>alert(2)</script><a href="javascript:alert(3)" onmouseover="x">bad</a><img src="https://example.com/a.jpg" onerror="x"><img src="data:image/png;base64,abc"></p>',
  );

  assert.equal(sanitized.includes('<script>'), false);
  assert.equal(sanitized.includes('onclick'), false);
  assert.equal(sanitized.includes('onmouseover'), false);
  assert.equal(sanitized.includes('onerror'), false);
  assert.equal(sanitized.includes('javascript:'), false);
  assert.equal(sanitized.includes('data:image'), false);
  assert.match(sanitized, /<img[^>]+src="https:\/\/example\.com\/a\.jpg"/);
});

test('blogPostInputSchema enforces title, status, and gallery count', () => {
  const validInput = {
    title: 'Mainland setup guide',
    slug: 'mainland-setup-guide',
    status: 'draft',
    contentJson: { type: 'doc', content: [] },
    contentHtml: '<p>Body</p>',
    galleryMediaIds: ['00000000-0000-4000-8000-000000000001'],
  };

  assert.equal(blogPostInputSchema.safeParse(validInput).success, true);
  assert.equal(blogPostInputSchema.safeParse({ ...validInput, title: '' }).success, false);
  assert.equal(blogPostInputSchema.safeParse({ ...validInput, status: 'live' }).success, false);
  assert.equal(
    blogPostInputSchema.safeParse({ ...validInput, status: 'published' }).success,
    false,
  );
  assert.equal(
    blogPostInputSchema.safeParse({
      ...validInput,
      status: 'published',
      publishedAt: '2026-07-01T10:00:00.000Z',
      scheduledFor: '2026-07-02T10:00:00.000Z',
    }).success,
    false,
  );
  assert.equal(
    blogPostInputSchema.safeParse({ ...validInput, status: 'scheduled' }).success,
    false,
  );
  assert.equal(
    blogPostInputSchema.safeParse({
      ...validInput,
      status: 'scheduled',
      scheduledFor: '2026-07-02T10:00:00.000Z',
    }).success,
    true,
  );
  assert.equal(
    blogPostInputSchema.safeParse({
      ...validInput,
      termIds: [
        '00000000-0000-4000-8000-000000000010',
        '00000000-0000-4000-8000-000000000010',
      ],
    }).success,
    false,
  );
  assert.equal(
    blogPostInputSchema.safeParse({
      ...validInput,
      galleryMediaIds: [
        '00000000-0000-4000-8000-000000000001',
        '00000000-0000-4000-8000-000000000001',
      ],
    }).success,
    false,
  );
  assert.equal(
    blogPostInputSchema.safeParse({
      ...validInput,
      galleryMediaIds: Array.from(
        { length: MAX_GALLERY_IMAGES + 1 },
        (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
      ),
    }).success,
    false,
  );
});

test('blogTermInputSchema requires a supported term kind', () => {
  assert.equal(
    blogTermInputSchema.safeParse({ kind: 'category', name: 'Company setup', slug: 'company-setup' })
      .success,
    true,
  );
  assert.equal(
    blogTermInputSchema.safeParse({ kind: 'attribute', name: 'Featured', slug: 'featured' }).success,
    true,
  );
  assert.equal(
    blogTermInputSchema.safeParse({ kind: 'tag', name: 'Dubai', slug: 'dubai' }).success,
    true,
  );
  assert.equal(
    blogTermInputSchema.safeParse({ kind: 'topic', name: 'Dubai', slug: 'dubai' }).success,
    false,
  );
});

test('mapBlogTermRow converts database fields to blog term shape', () => {
  assert.deepEqual(
    mapBlogTermRow({
      id: '00000000-0000-4000-8000-000000000010',
      kind: 'category',
      slug: 'company-setup',
      name: 'Company setup',
      description: 'Formation guides',
      parent_id: '00000000-0000-4000-8000-000000000011',
      sort_order: 20,
      created_by: '00000000-0000-4000-8000-000000000012',
      created_at: '2026-07-01T08:00:00.000Z',
      updated_at: '2026-07-01T09:00:00.000Z',
    }),
    {
      id: '00000000-0000-4000-8000-000000000010',
      kind: 'category',
      slug: 'company-setup',
      name: 'Company setup',
      description: 'Formation guides',
      parentId: '00000000-0000-4000-8000-000000000011',
      sortOrder: 20,
      createdBy: '00000000-0000-4000-8000-000000000012',
      createdAt: '2026-07-01T08:00:00.000Z',
      updatedAt: '2026-07-01T09:00:00.000Z',
    },
  );
});

test('mapBlogPostRow converts database fields to blog post shape', () => {
  const contentJson = { type: 'doc', content: [{ type: 'paragraph' }] };

  assert.deepEqual(
    mapBlogPostRow({
      id: '00000000-0000-4000-8000-000000000020',
      slug: 'mainland-setup-guide',
      title: 'Mainland setup guide',
      excerpt: 'Setup overview',
      content_json: contentJson,
      content_html: '<p>Setup overview</p>',
      status: 'published',
      published_at: '2026-07-01T08:00:00.000Z',
      scheduled_for: null,
      meta_title: 'Mainland setup',
      meta_description: 'A guide to company setup',
      canonical_url: 'https://example.com/blog/mainland-setup-guide',
      noindex: false,
      featured_media_id: '00000000-0000-4000-8000-000000000021',
      author_id: '00000000-0000-4000-8000-000000000022',
      created_by: '00000000-0000-4000-8000-000000000023',
      updated_by: '00000000-0000-4000-8000-000000000024',
      deleted_at: null,
      created_at: '2026-07-01T07:00:00.000Z',
      updated_at: '2026-07-01T09:00:00.000Z',
    }),
    {
      id: '00000000-0000-4000-8000-000000000020',
      slug: 'mainland-setup-guide',
      title: 'Mainland setup guide',
      excerpt: 'Setup overview',
      contentJson,
      contentHtml: '<p>Setup overview</p>',
      status: 'published',
      publishedAt: '2026-07-01T08:00:00.000Z',
      scheduledFor: null,
      metaTitle: 'Mainland setup',
      metaDescription: 'A guide to company setup',
      canonicalUrl: 'https://example.com/blog/mainland-setup-guide',
      noindex: false,
      featuredMediaId: '00000000-0000-4000-8000-000000000021',
      termIds: [],
      galleryMediaIds: [],
      authorId: '00000000-0000-4000-8000-000000000022',
      createdBy: '00000000-0000-4000-8000-000000000023',
      updatedBy: '00000000-0000-4000-8000-000000000024',
      deletedAt: null,
      createdAt: '2026-07-01T07:00:00.000Z',
      updatedAt: '2026-07-01T09:00:00.000Z',
    },
  );
});

test('mapBlogMediaRow converts database fields to blog media shape', () => {
  assert.deepEqual(
    mapBlogMediaRow({
      id: '00000000-0000-4000-8000-000000000030',
      storage_path: 'blog/2026/07/image.webp',
      public_url: 'https://storage.example/blog/2026/07/image.webp',
      original_name: 'image.webp',
      sha256: 'abc123',
      alt_text: 'Office setup',
      caption: 'Dubai office setup',
      width: 1200,
      height: 800,
      mime_type: 'image/webp',
      size_bytes: 200000,
      uploaded_by: '00000000-0000-4000-8000-000000000031',
      created_at: '2026-07-01T07:00:00.000Z',
      updated_at: '2026-07-01T09:00:00.000Z',
    }),
    {
      id: '00000000-0000-4000-8000-000000000030',
      storagePath: 'blog/2026/07/image.webp',
      publicUrl: 'https://storage.example/blog/2026/07/image.webp',
      originalName: 'image.webp',
      sha256: 'abc123',
      altText: 'Office setup',
      caption: 'Dubai office setup',
      width: 1200,
      height: 800,
      mimeType: 'image/webp',
      sizeBytes: 200000,
      uploadedBy: '00000000-0000-4000-8000-000000000031',
      createdAt: '2026-07-01T07:00:00.000Z',
      updatedAt: '2026-07-01T09:00:00.000Z',
    },
  );
});

test('blog write operations reject non-platform actors before database access', async () => {
  const supabase = createBlogSupabaseStub();

  await assert.rejects(
    () =>
      createBlogTerm(
        { kind: 'category', name: 'Company setup', slug: 'company-setup' },
        { id: '00000000-0000-4000-8000-000000000040', role: 'pro' },
        { supabase: supabase as never },
      ),
    (error) => error instanceof ApiError && error.code === 'FORBIDDEN',
  );

  assert.equal(supabase.tables.size, 0);
});

test('upsertBlogPost sanitizes content, stores taxonomy/gallery links, and writes revision', async () => {
  const supabase = createBlogSupabaseStub();
  const actor = { id: '00000000-0000-4000-8000-000000000050', role: 'admin' };

  const post = await upsertBlogPost(
    {
      title: 'UAE Setup',
      slug: 'UAE Setup!',
      excerpt: 'Overview',
      contentJson: { type: 'doc', content: [] },
      contentHtml: '<p onclick="x">Body<script>alert(1)</script></p>',
      status: 'published',
      publishedAt: '2026-07-01T10:00:00.000Z',
      termIds: ['00000000-0000-4000-8000-000000000060'],
      galleryMediaIds: ['00000000-0000-4000-8000-000000000070'],
    },
    actor,
    undefined,
    { supabase: supabase as never },
  );

  assert.equal(post.slug, 'uae-setup');
  assert.equal(post.contentHtml, '<p>Body</p>');
  assert.equal(supabase.tables.get('blog_posts')?.[0].published_at, '2026-07-01T10:00:00.000Z');
  assert.equal(supabase.tables.get('blog_posts')?.[0].scheduled_for, null);
  assert.equal(supabase.tables.get('blog_post_terms')?.[0].term_id, '00000000-0000-4000-8000-000000000060');
  assert.equal(
    supabase.tables.get('blog_post_gallery_items')?.[0].media_id,
    '00000000-0000-4000-8000-000000000070',
  );
  assert.equal(supabase.tables.get('blog_post_revisions')?.[0].content_html, '<p>Body</p>');
});

test('upsertBlogPost soft-deletes a new post when relation or revision writes fail', async () => {
  const supabase = createBlogSupabaseStub({}, { failInsertTable: 'blog_post_revisions' });
  const actor = { id: '00000000-0000-4000-8000-000000000050', role: 'admin' };

  await assert.rejects(
    () =>
      upsertBlogPost(
        {
          title: 'UAE Setup',
          slug: 'uae-setup',
          contentJson: { type: 'doc', content: [] },
          contentHtml: '<p>Body</p>',
          status: 'published',
          publishedAt: '2026-07-01T10:00:00.000Z',
        },
        actor,
        undefined,
        { supabase: supabase as never },
      ),
    /blog_post_revisions insert failed/,
  );

  assert.equal(typeof supabase.tables.get('blog_posts')?.[0].deleted_at, 'string');
});

test('getAdminBlogPost includes selected term and gallery media ids for edit forms', async () => {
  const postId = '00000000-0000-4000-8000-000000000090';
  const supabase = createBlogSupabaseStub({
    blog_posts: [
      {
        id: postId,
        slug: 'uae-setup',
        title: 'UAE Setup',
        excerpt: null,
        content_json: { type: 'doc', content: [] },
        content_html: '<p>Body</p>',
        status: 'draft',
        published_at: null,
        scheduled_for: null,
        meta_title: null,
        meta_description: null,
        canonical_url: null,
        noindex: false,
        featured_media_id: null,
        author_id: null,
        created_by: '00000000-0000-4000-8000-000000000091',
        updated_by: '00000000-0000-4000-8000-000000000091',
        deleted_at: null,
        created_at: '2026-07-01T07:00:00.000Z',
        updated_at: '2026-07-01T09:00:00.000Z',
      },
    ],
    blog_post_terms: [
      { post_id: postId, term_id: '00000000-0000-4000-8000-000000000101' },
      { post_id: postId, term_id: '00000000-0000-4000-8000-000000000102' },
    ],
    blog_post_gallery_items: [
      { post_id: postId, media_id: '00000000-0000-4000-8000-000000000202', sort_order: 1 },
      { post_id: postId, media_id: '00000000-0000-4000-8000-000000000201', sort_order: 0 },
    ],
  });

  const post = await getAdminBlogPost(postId, { supabase: supabase as never });

  assert.deepEqual(post?.termIds, [
    '00000000-0000-4000-8000-000000000101',
    '00000000-0000-4000-8000-000000000102',
  ]);
  assert.deepEqual(post?.galleryMediaIds, [
    '00000000-0000-4000-8000-000000000201',
    '00000000-0000-4000-8000-000000000202',
  ]);
});

test('uploadBlogMedia rejects invalid files and uses injected scanner/storage for valid images', async () => {
  const actor = { id: '00000000-0000-4000-8000-000000000080', role: 'super_admin' };

  await assert.rejects(
    () =>
      uploadBlogMedia(
        { file: { data: new Uint8Array(), originalName: 'empty.png', mimeType: 'image/png' } },
        actor,
      ),
    (error) => error instanceof ApiError && error.code === 'PAYLOAD_EMPTY',
  );

  await assert.rejects(
    () =>
      uploadBlogMedia(
        {
          file: {
            data: Buffer.from('not an image'),
            originalName: 'bad.txt',
            mimeType: 'text/plain',
          },
        },
        actor,
      ),
    (error) => error instanceof ApiError && error.code === 'UNSUPPORTED_MEDIA_TYPE',
  );

  const supabase = createBlogSupabaseStub();
  let scannedFilename = '';
  const media = await uploadBlogMedia(
    {
      file: {
        data: pngBytes(),
        originalName: 'Office Setup.png',
        mimeType: 'image/png',
      },
      altText: 'Office setup',
      caption: 'Dubai office setup',
      width: 1,
      height: 1,
    },
    actor,
    {
      supabase: supabase as never,
      scanFile: async (_data, options) => {
        scannedFilename = options.filename;
        return { clean: true, provider: 'test' };
      },
    },
  );

  assert.equal(scannedFilename, 'Office Setup.png');
  assert.equal(supabase.uploads[0].bucket, 'blog-media');
  assert.equal(supabase.uploads[0].contentType, 'image/png');
  assert.match(supabase.uploads[0].path, /^blog\/\d{4}\/\d{2}\/.+-office-setup\.png$/);
  assert.equal(media.publicUrl, `https://storage.example/${supabase.uploads[0].path}`);
  assert.equal(media.uploadedBy, actor.id);
  assert.equal(supabase.tables.get('blog_media')?.[0].sha256, media.sha256);
});

test('uploadBlogMedia removes public object when metadata insert fails', async () => {
  const actor = { id: '00000000-0000-4000-8000-000000000080', role: 'super_admin' };
  const supabase = createBlogSupabaseStub({}, { failInsertTable: 'blog_media' });

  await assert.rejects(
    () =>
      uploadBlogMedia(
        {
          file: {
            data: pngBytes(),
            originalName: 'Office Setup.png',
            mimeType: 'image/png',
          },
        },
        actor,
        {
          supabase: supabase as never,
          scanFile: async () => ({ clean: true, provider: 'test' }),
        },
      ),
    /blog_media insert failed/,
  );

  assert.equal(supabase.removals[0].bucket, 'blog-media');
  assert.deepEqual(supabase.removals[0].paths, [supabase.uploads[0].path]);
});
