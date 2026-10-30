export async function runRateLimitedFinancialEffect<T>(
  consume: () => Promise<string>,
  effect: () => Promise<T>,
): Promise<{ allowed: false } | { allowed: true; value: T }> {
  if ((await consume()) !== 'allowed') return { allowed: false };
  return { allowed: true, value: await effect() };
}
