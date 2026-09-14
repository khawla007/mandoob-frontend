import type { SyntheticContactOutcome } from './demo-adapter';

const CONTACT_DEMO_OUTCOMES = new Set<SyntheticContactOutcome>([
  'success',
  'duplicate',
  'rate_limited',
  'failure',
  'unavailable',
]);

export function resolveContactDemoMode(
  value: string | string[] | undefined,
  environment: string | undefined,
): { outcome: SyntheticContactOutcome; delayMs: 900 } | undefined {
  if (
    environment !== 'development' ||
    typeof value !== 'string' ||
    !CONTACT_DEMO_OUTCOMES.has(value as SyntheticContactOutcome)
  ) {
    return undefined;
  }

  return { outcome: value as SyntheticContactOutcome, delayMs: 900 };
}
