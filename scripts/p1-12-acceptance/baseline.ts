import { P112_BASELINE } from './contract';

export type BaselineSnapshot = {
  [K in Exclude<keyof typeof P112_BASELINE, 'cmsPageSlugs'>]: (typeof P112_BASELINE)[K];
} & { cmsPageSlugs: string[] };

export function assertExactBaseline(value: unknown): asserts value is BaselineSnapshot {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('P1.12 baseline unreadable');
  }
  const snapshot = value as Record<string, unknown>;
  for (const [key, expected] of Object.entries(P112_BASELINE)) {
    if (key === 'cmsPageSlugs') continue;
    const actual = snapshot[key];
    if (typeof expected === 'number' && (!Number.isInteger(actual) || actual !== expected)) {
      throw new Error(`P1.12 baseline mismatch: ${key}`);
    }
    if (typeof expected === 'boolean' && actual !== expected) {
      throw new Error(`P1.12 baseline mismatch: ${key}`);
    }
  }
  if (!Array.isArray(snapshot.cmsPageSlugs)) throw new Error('P1.12 CMS slugs unreadable');
  const actualSlugs = snapshot.cmsPageSlugs.filter(
    (value): value is string => typeof value === 'string',
  );
  const expectedSlugs = [...P112_BASELINE.cmsPageSlugs];
  if (
    actualSlugs.length !== snapshot.cmsPageSlugs.length ||
    actualSlugs.length !== expectedSlugs.length ||
    actualSlugs.sort().join('\n') !== expectedSlugs.sort().join('\n')
  ) {
    throw new Error('P1.12 CMS slug baseline mismatch');
  }
}
