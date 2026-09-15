import { respondWithPublicCatalog } from '@/lib/data/public-catalog-http';

export async function GET(request: Request) {
  return respondWithPublicCatalog('packages', request);
}
