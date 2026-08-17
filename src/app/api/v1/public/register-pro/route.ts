export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST() {
  return Response.json(
    {
      ok: false,
      code: 'GONE',
      error: 'Public PRO registration is no longer available',
    },
    { status: 410, headers: { 'cache-control': 'no-store' } },
  );
}
