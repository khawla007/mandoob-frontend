import 'server-only';

import {
  listPublicCatalog,
  normalizePublicCatalogQuery,
  type PublicCatalogQueryInput,
  type PublicCatalogResource,
  type PublicCatalogResult,
} from './public-catalog';

type Dependencies = {
  load?: (
    resource: PublicCatalogResource,
    query: PublicCatalogQueryInput,
  ) => Promise<PublicCatalogResult>;
};

export async function respondWithPublicCatalog(
  resource: PublicCatalogResource,
  request: Request,
  dependencies: Dependencies = {},
): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const query = normalizePublicCatalogQuery({
    page: params.get('page'),
    pageSize: params.get('pageSize'),
    jurisdiction: params.get('jurisdiction'),
    q: params.get('q'),
    authoritySlug: params.get('authoritySlug'),
  });
  const result = await (dependencies.load ?? listPublicCatalog)(resource, query);
  const available = result.state === 'ready';
  return Response.json(result, {
    status: available ? 200 : 503,
    headers: {
      'Cache-Control': available ? 'public, max-age=60, stale-while-revalidate=300' : 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

export async function respondWithPublicAuthorityDetail(
  slug: string,
  dependencies: Dependencies = {},
): Promise<Response> {
  const query = normalizePublicCatalogQuery({ authoritySlug: slug, page: 1, pageSize: 1 });
  if (!query.authoritySlug) return missingAuthorityResponse();
  const load = dependencies.load ?? listPublicCatalog;
  const result = await load('authorities', query);
  if (result.state === 'ready') {
    return Response.json(result, {
      headers: {
        'Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  }
  if (result.reason === 'not_populated') {
    const population = await load('authorities', { page: 1, pageSize: 1 });
    if (population.state === 'ready' && population.total > 0) return missingAuthorityResponse();
  }
  return Response.json(result, {
    status: 503,
    headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  });
}

function missingAuthorityResponse(): Response {
  return Response.json(
    { state: 'missing', resource: 'authority' },
    {
      status: 404,
      headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
    },
  );
}
