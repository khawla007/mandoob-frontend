# Legal Pages CMS Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Privacy, Terms, PDPL, and Trust Center editable CMS pages while preserving their `/legal/{slug}` URLs and shared public template.

**Architecture:** A small legal-page policy module owns the four-slug allowlist and published-page resolution. The nested legal route becomes a CMS adapter; the root CMS route and sitemap use the same policy to avoid duplicate root URLs. An idempotent Supabase migration seeds matching TipTap JSON and HTML for editor round trips.

**Tech Stack:** Next.js 16 App Router, React 19 Server Components, TypeScript, Node test runner, Supabase PostgreSQL, TipTap JSON, existing `PublicCmsPage` renderer.

---

## File map

- Create `src/lib/pages/legal.ts`: legal slug policy, canonical public path, and visibility-aware loader.
- Create `src/lib/pages/legal.test.ts`: allowlist, path, loader-call, and visibility tests.
- Replace `src/app/(public)/legal/[slug]/page.tsx`: generic CMS metadata and rendering adapter.
- Modify `src/app/(public)/[slug]/page.tsx`: reject the four legal slugs at root.
- Modify `src/app/sitemap.ts` and `src/app/sitemap.test.ts`: emit legal CMS records only at nested canonical paths.
- Create `../supabase/migrations/0046_seed_legal_cms_pages.sql`: idempotent four-page content seed.
- Create `src/lib/pages/legal-migration.test.ts`: migration contract and content parity checks.

### Task 1: Legal page policy

**Files:**
- Create: `src/lib/pages/legal.test.ts`
- Create: `src/lib/pages/legal.ts`

- [ ] **Step 1: Write the failing policy tests**

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import type { CmsPage } from '@/lib/data/pages';
import { isLegalCmsPageSlug, legalCmsPagePath, resolveLegalCmsPage } from './legal';

const page = (overrides: Partial<CmsPage> = {}): CmsPage => ({
  id: 'page-1', slug: 'privacy', title: 'Privacy Policy', contentJson: {}, contentHtml: '<p>Body</p>',
  heroSettings: {}, backgroundImageMediaId: null, status: 'published',
  publishedAt: '2026-05-22T00:00:00.000Z', scheduledFor: null,
  metaTitle: null, metaDescription: null, canonicalUrl: 'https://mandoob.ae/legal/privacy', noindex: false,
  schemaMarkup: null, scriptHead: null, scriptBodyStart: null, scriptBodyEnd: null,
  createdBy: null, updatedBy: null, deletedAt: null,
  createdAt: '2026-05-22T00:00:00.000Z', updatedAt: '2026-05-22T00:00:00.000Z', ...overrides,
});

test('allows only the four legal CMS slugs and maps their canonical paths', () => {
  for (const slug of ['privacy', 'terms', 'pdpl', 'trust']) {
    assert.equal(isLegalCmsPageSlug(slug), true);
    assert.equal(legalCmsPagePath(slug), `/legal/${slug}`);
  }
  assert.equal(isLegalCmsPageSlug('about'), false);
  assert.equal(isLegalCmsPageSlug('Privacy'), false);
  assert.equal(legalCmsPagePath('about'), null);
});

test('does not query unsupported legal slugs', async () => {
  let calls = 0;
  assert.equal(await resolveLegalCmsPage('about', async () => { calls += 1; return page(); }), null);
  assert.equal(calls, 0);
});

test('returns only currently published legal CMS records', async () => {
  const now = new Date('2026-07-14T00:00:00.000Z');
  assert.equal((await resolveLegalCmsPage('privacy', async () => page(), now))?.slug, 'privacy');
  for (const unavailable of [page({ status: 'draft' }), page({ publishedAt: '2026-07-15T00:00:00.000Z' }), page({ deletedAt: '2026-07-01T00:00:00.000Z' })]) {
    assert.equal(await resolveLegalCmsPage('privacy', async () => unavailable, now), null);
  }
});
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `node --import tsx --conditions=react-server --test 'src/lib/pages/legal.test.ts'`

Expected: FAIL because `src/lib/pages/legal.ts` does not exist.

- [ ] **Step 3: Implement the policy module**

```ts
import type { CmsPage } from '@/lib/data/pages';
import { isCmsPagePublic } from '@/lib/pages/visibility';

export const LEGAL_CMS_PAGE_SLUGS = ['privacy', 'terms', 'pdpl', 'trust'] as const;
const legalSlugs = new Set<string>(LEGAL_CMS_PAGE_SLUGS);
type Loader = (slug: string) => Promise<CmsPage | null>;

export function isLegalCmsPageSlug(slug: string): boolean {
  return legalSlugs.has(slug);
}

export function legalCmsPagePath(slug: string): string | null {
  return isLegalCmsPageSlug(slug) ? `/legal/${slug}` : null;
}

export async function resolveLegalCmsPage(slug: string, load: Loader, now = new Date()): Promise<CmsPage | null> {
  if (!isLegalCmsPageSlug(slug)) return null;
  const page = await load(slug);
  return page && isCmsPagePublic(page, now) ? page : null;
}
```

- [ ] **Step 4: Run the focused test and confirm GREEN**

Run: `node --import tsx --conditions=react-server --test 'src/lib/pages/legal.test.ts'`

Expected: 3 tests pass.

- [ ] **Step 5: Commit the policy**

```bash
git add src/lib/pages/legal.ts src/lib/pages/legal.test.ts
git commit -m "feat: define legal CMS page policy"
```

### Task 2: Replace hardcoded legal rendering

**Files:**
- Modify: `src/lib/pages/legal.test.ts`
- Replace: `src/app/(public)/legal/[slug]/page.tsx`
- Modify: `src/app/(public)/[slug]/page.tsx`

- [ ] **Step 1: Add a root-route exclusion assertion**

Add to `legal.test.ts`:

```ts
test('identifies every slug that the root CMS route must reject', () => {
  assert.deepEqual(['privacy', 'terms', 'pdpl', 'trust'].filter(isLegalCmsPageSlug), ['privacy', 'terms', 'pdpl', 'trust']);
});
```

- [ ] **Step 2: Run the focused test**

Run: `node --import tsx --conditions=react-server --test 'src/lib/pages/legal.test.ts'`

Expected: 4 tests pass; the next edits wire the tested policy into routing.

- [ ] **Step 3: Replace the legal route with the shared CMS adapter**

Replace `src/app/(public)/legal/[slug]/page.tsx` with:

```tsx
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { buildCmsPageMetadata, PublicCmsPage, serializeSchema } from '@/components/pages/PublicCmsPage';
import { getPublishedCmsPageBySlug } from '@/lib/data/pages';
import { resolveLegalCmsPage } from '@/lib/pages/legal';

type PageProps = { params: Promise<{ slug: string }> };
const getCachedPublishedPage = cache(getPublishedCmsPageBySlug);

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  return buildCmsPageMetadata(await resolveLegalCmsPage(slug, getCachedPublishedPage));
}

export default async function LegalCmsPageRoute({ params }: PageProps) {
  const { slug } = await params;
  const page = await resolveLegalCmsPage(slug, getCachedPublishedPage);
  if (!page) notFound();
  return <><PublicCmsPage page={page} />{page.schemaMarkup ? <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeSchema(page.schemaMarkup) }} /> : null}</>;
}
```

- [ ] **Step 4: Reject legal aliases in the root CMS route**

Import `isLegalCmsPageSlug` in `src/app/(public)/[slug]/page.tsx`. In both `generateMetadata` and the page component, return `{}` or call `notFound()` before resolving when it returns true:

```tsx
if (isLegalCmsPageSlug(slug)) return {};
```

```tsx
if (isLegalCmsPageSlug(slug)) notFound();
```

- [ ] **Step 5: Verify routing code and remove hardcoded content**

Run: `rg -n "const DOCS|LegalDoc|This Privacy Policy explains" 'src/app/(public)/legal/[slug]/page.tsx'`

Expected: no matches.

Run: `npx tsc --noEmit`

Expected: exit 0.

- [ ] **Step 6: Commit routing**

```bash
git add 'src/app/(public)/legal/[slug]/page.tsx' 'src/app/(public)/[slug]/page.tsx' src/lib/pages/legal.test.ts
git commit -m "feat: render legal pages from CMS"
```

### Task 3: Canonical sitemap paths

**Files:**
- Modify: `src/app/sitemap.test.ts`
- Modify: `src/app/sitemap.ts`

- [ ] **Step 1: Write the failing sitemap test**

```ts
test('maps legal CMS slugs to nested canonical URLs without root aliases', () => {
  const sitemap = buildPublicSitemap({
    cmsPages: ['privacy', 'terms', 'pdpl', 'trust'].map((slug) => ({
      slug, updatedAt: '2026-07-14T00:00:00.000Z', noindex: false,
    })),
  });
  const urls = sitemap.map((entry) => entry.url);
  for (const slug of ['privacy', 'terms', 'pdpl', 'trust']) {
    assert.ok(urls.includes(`https://mandoob.ae/legal/${slug}`));
    assert.ok(!urls.includes(`https://mandoob.ae/${slug}`));
  }
});
```

- [ ] **Step 2: Run the sitemap test and confirm RED**

Run: `node --import tsx --conditions=react-server --test 'src/app/sitemap.test.ts'`

Expected: FAIL because current sitemap emits root paths.

- [ ] **Step 3: Map legal slugs through the shared policy**

Import `legalCmsPagePath` and replace the CMS entry URL construction with:

```ts
const path = legalCmsPagePath(slug) ?? `/${slug}`;
const entry = {
  url: `${base}${path}`,
  lastModified: new Date(page.updatedAt),
  changeFrequency: 'monthly' as const,
  priority: 0.7,
};
```

- [ ] **Step 4: Run sitemap tests and confirm GREEN**

Run: `node --import tsx --conditions=react-server --test 'src/app/sitemap.test.ts'`

Expected: all sitemap tests pass.

- [ ] **Step 5: Commit sitemap behavior**

```bash
git add src/app/sitemap.ts src/app/sitemap.test.ts
git commit -m "fix: canonicalize legal CMS sitemap URLs"
```

### Task 4: Seed editable legal pages

**Files:**
- Create: `../supabase/migrations/0046_seed_legal_cms_pages.sql`
- Create: `src/lib/pages/legal-migration.test.ts`

- [ ] **Step 1: Write the failing migration contract test**

Read `../../../../supabase/migrations/0046_seed_legal_cms_pages.sql` from the test file and assert:

```ts
for (const slug of ['privacy', 'terms', 'pdpl', 'trust']) {
  assert.match(sql, new RegExp(`'${slug}'`));
  assert.match(sql, new RegExp(`https://mandoob\\.ae/legal/${slug}`));
}
assert.match(sql, /content_json/);
assert.match(sql, /content_html/);
assert.match(sql, /status[\s\S]*published/);
assert.match(sql, /published_at/);
assert.match(sql, /on conflict \(slug\) where deleted_at is null do update/i);
for (const preservedText of ['Data we collect', 'Subscriptions and fees', 'Data residency', 'Certifications']) {
  assert.match(sql, new RegExp(preservedText));
}
```

- [ ] **Step 2: Run the migration test and confirm RED**

Run: `node --import tsx --conditions=react-server --test 'src/lib/pages/legal-migration.test.ts'`

Expected: FAIL with `ENOENT` because migration 0046 does not exist.

- [ ] **Step 3: Create the idempotent migration**

Create one `insert into public.cms_pages (...) values (...)` statement with four rows. For every row set:

```sql
status = 'published'
published_at = '2026-05-22T00:00:00Z'
scheduled_for = null
hero_settings = '{}'::jsonb
noindex = false
schema_markup = '{}'::jsonb
canonical_url = 'https://mandoob.ae/legal/{slug}'
```

Encode every paragraph, heading, and list item from the removed route in TipTap `content_json` (`doc` → `paragraph`, `heading`, `bulletList`, `listItem`, `text`) and the semantically identical `content_html`. Put `Last updated: 22 May 2026` first in both forms. Use this conflict clause so reruns update active records without restoring soft-deleted rows:

```sql
on conflict (slug) where deleted_at is null do update set
  title = excluded.title,
  content_json = excluded.content_json,
  content_html = excluded.content_html,
  status = excluded.status,
  published_at = excluded.published_at,
  scheduled_for = excluded.scheduled_for,
  hero_settings = excluded.hero_settings,
  meta_title = excluded.meta_title,
  meta_description = excluded.meta_description,
  canonical_url = excluded.canonical_url,
  noindex = excluded.noindex,
  schema_markup = excluded.schema_markup,
  deleted_at = null;
```

- [ ] **Step 4: Run the migration contract test and confirm GREEN**

Run: `node --import tsx --conditions=react-server --test 'src/lib/pages/legal-migration.test.ts'`

Expected: migration contract test passes.

- [ ] **Step 5: Validate migration application if a linked/local Supabase database is available**

Run: `npx supabase db push --dry-run`

Expected: migration 0046 is parsed and listed without SQL errors. If the CLI/database is unavailable, report that limitation and retain the contract test evidence.

- [ ] **Step 6: Commit tracked migration test**

```bash
git add src/lib/pages/legal-migration.test.ts
git commit -m "test: verify legal CMS seed migration"
```

The migration lives in the parent workspace's `supabase/migrations` directory and must be included in the parent project's delivery even though the frontend Git repository does not track it.

### Task 5: Full verification

**Files:** No new files.

- [ ] **Step 1: Run focused tests**

Run: `node --import tsx --conditions=react-server --test 'src/lib/pages/legal.test.ts' 'src/lib/pages/legal-migration.test.ts' 'src/app/sitemap.test.ts' 'src/app/(public)/[slug]/page.test.ts'`

Expected: all focused tests pass.

- [ ] **Step 2: Run the full test suite**

Run: `npm test`

Expected: zero failures.

- [ ] **Step 3: Run static checks**

Run: `npx tsc --noEmit`

Expected: exit 0.

Run: `npm run lint`

Expected: exit 0 with no new warnings.

- [ ] **Step 4: Run production build**

Run: `npm run build`

Expected: successful Next.js production build.

- [ ] **Step 5: Confirm final scope**

Run: `git status --short && git diff --check`

Expected: only intended legal CMS files are changed and `git diff --check` exits 0.

