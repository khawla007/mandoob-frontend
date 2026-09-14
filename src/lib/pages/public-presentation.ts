import type { CmsPage } from '@/lib/data/pages';
import { resolveLegalCmsPage } from '@/lib/pages/legal';
import { RESERVED_PAGE_SLUGS } from '@/lib/pages/slug';
import { isCmsPagePublic } from '@/lib/pages/visibility';
import type { PublicReadState } from '@/lib/public-content/read-state';
import { missingState, readyState, unavailableState } from '@/lib/public-content/read-state';

type Loader = (slug: string) => Promise<CmsPage | null>;

const TRUST_COPY_REPLACEMENTS = [
  ['per-tenant isolation via Postgres row-level security', 'per-tenant isolation controls'],
  ['Certifications', 'Security assurance'],
  [
    'PDPL aligned · ISO 27001 · TLS 1.3 · SOC 2 in progress.',
    'Security controls and independent assurance status are reviewed before publication. Contact security@mandoob.ae for current information.',
  ],
] as const;

function replaceTrustClaims(value: string): string {
  return TRUST_COPY_REPLACEMENTS.reduce(
    (result, [claim, replacement]) => result.replaceAll(claim, replacement),
    value,
  );
}

function projectLegalPage(page: CmsPage): CmsPage {
  if (page.slug !== 'trust') return page;
  return {
    ...page,
    contentHtml: replaceTrustClaims(page.contentHtml),
    contentJson: JSON.parse(replaceTrustClaims(JSON.stringify(page.contentJson))) as Record<
      string,
      unknown
    >,
  };
}

export async function resolveLegalPageState(
  slug: string,
  load: Loader,
  now: Date = new Date(),
): Promise<PublicReadState<CmsPage>> {
  try {
    const page = await resolveLegalCmsPage(slug, load, now);
    return page ? readyState(projectLegalPage(page)) : missingState();
  } catch {
    return unavailableState();
  }
}

export async function resolveGenericPageState(
  slug: string,
  load: Loader,
  now: Date = new Date(),
): Promise<PublicReadState<CmsPage>> {
  if (RESERVED_PAGE_SLUGS.has(slug.toLowerCase())) return missingState();
  try {
    const page = await load(slug);
    return page && isCmsPagePublic(page, now) ? readyState(page) : missingState();
  } catch {
    return unavailableState();
  }
}
