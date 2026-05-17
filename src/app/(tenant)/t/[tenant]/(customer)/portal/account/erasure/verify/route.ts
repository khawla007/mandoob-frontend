import { NextResponse } from 'next/server';
import { verifyErasureRequest } from '@/lib/data/erasure';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ tenant: string }> },
) {
  const { tenant } = await params;
  const url = new URL(request.url);
  const token = url.searchParams.get('token');
  if (!token) {
    return NextResponse.redirect(new URL(`/t/${tenant}/portal/account/erasure?verified=missing`, url.origin));
  }

  try {
    await verifyErasureRequest(token);
    return NextResponse.redirect(new URL(`/t/${tenant}/portal/account/erasure?verified=1`, url.origin));
  } catch (e) {
    console.error('erasure verification failed', e);
    return NextResponse.redirect(new URL(`/t/${tenant}/portal/account/erasure?verified=failed`, url.origin));
  }
}
