const STRIPE_REDIRECT_HOSTS = new Set(['checkout.stripe.com', 'billing.stripe.com']);

export function normalizeStripeRedirectUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (
      url.protocol !== 'https:' ||
      url.port !== '' ||
      url.username !== '' ||
      url.password !== '' ||
      !STRIPE_REDIRECT_HOSTS.has(url.hostname)
    ) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}
