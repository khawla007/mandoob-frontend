import { createHash } from 'node:crypto';

/** Deterministic injected provider used only by focused/local acceptance; never selected from production env. */
export function createLocalStripeEffect(
  effectKey: string,
  kind: 'checkout' | 'portal' | 'change' | 'cancel',
) {
  const id = createHash('sha256').update(`${kind}:${effectKey}`).digest('hex').slice(0, 24);
  return {
    reference:
      kind === 'checkout'
        ? `cs_test_${id}`
        : kind === 'portal'
          ? `bps_test_${id}`
          : `sub_test_${id}`,
    url:
      kind === 'checkout'
        ? `https://checkout.stripe.com/c/pay/${id}`
        : kind === 'portal'
          ? `https://billing.stripe.com/p/session/${id}`
          : null,
  };
}
