import { issueCsrfCookie } from '@/lib/auth/csrf';
import { jsonOk } from '@/lib/errors';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const token = await issueCsrfCookie();
  return jsonOk({ token });
}
