import { respondWithPublicAuthorityDetail } from '@/lib/data/public-catalog-http';

export async function GET(_request: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  return respondWithPublicAuthorityDetail(slug);
}
