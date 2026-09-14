const P112_PUBLIC_ORIGIN = 'https://mandoob.ae';

export function normalizeP112Canonical(value: string): string {
  const url = new URL(value, P112_PUBLIC_ORIGIN);
  if (url.origin !== P112_PUBLIC_ORIGIN || url.search || url.hash) {
    throw new Error('P1.12 canonical rejected');
  }
  return url.pathname;
}
