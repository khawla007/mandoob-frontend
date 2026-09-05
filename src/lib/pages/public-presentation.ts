import type { CmsPage } from '@/lib/data/pages';
import { resolveLegalCmsPage } from '@/lib/pages/legal';
import { RESERVED_PAGE_SLUGS } from '@/lib/pages/slug';
import { isCmsPagePublic } from '@/lib/pages/visibility';
import type { PublicReadState } from '@/lib/public-content/read-state';
import { missingState, readyState, unavailableState } from '@/lib/public-content/read-state';

type Loader = (slug: string) => Promise<CmsPage | null>;

export async function resolveLegalPageState(
  slug: string,
  load: Loader,
  now: Date = new Date(),
): Promise<PublicReadState<CmsPage>> {
  try {
    const page = await resolveLegalCmsPage(slug, load, now);
    return page ? readyState(page) : missingState();
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
