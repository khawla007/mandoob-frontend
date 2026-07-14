import type { CmsPage } from '@/lib/data/pages';
import { isCmsPagePublic } from '@/lib/pages/visibility';

export const LEGAL_CMS_PAGE_SLUGS = ['privacy', 'terms', 'pdpl', 'trust'] as const;

const legalSlugs = new Set<string>(LEGAL_CMS_PAGE_SLUGS);

type CmsPageLoader = (slug: string) => Promise<CmsPage | null>;

export function isLegalCmsPageSlug(slug: string): boolean {
  return legalSlugs.has(slug);
}

export function legalCmsPagePath(slug: string): string | null {
  return isLegalCmsPageSlug(slug) ? `/legal/${slug}` : null;
}

export async function resolveLegalCmsPage(
  slug: string,
  load: CmsPageLoader,
  now: Date = new Date(),
): Promise<CmsPage | null> {
  if (!isLegalCmsPageSlug(slug)) return null;

  const page = await load(slug);
  return page && isCmsPagePublic(page, now) ? page : null;
}
