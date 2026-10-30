type Mode = 'success' | 'failure' | 'timeout-before-effect' | 'timeout-after-effect' | 'crash';
type Stored = { providerReference: string; redirectUrl: string | null; status: 'succeeded' };

export function createLocalTapFixture(environment: string | undefined) {
  if (environment === 'production') throw new Error('LOCAL_PROVIDER_DISABLED');
  const effects = new Map<string, Stored>();
  return {
    async effect(key: string, mode: Mode) {
      if (mode === 'crash') throw new Error('LOCAL_PROVIDER_CRASH');
      if (mode === 'failure') return { kind: 'failed' as const, retryable: false };
      if (mode === 'timeout-before-effect') return { kind: 'unknown' as const };
      const stored = effects.get(key) ?? {
        providerReference: `local-${key}`,
        redirectUrl: `http://127.0.0.1/tap/${encodeURIComponent(key)}`,
        status: 'succeeded' as const,
      };
      effects.set(key, stored);
      return mode === 'timeout-after-effect'
        ? { kind: 'unknown' as const }
        : { kind: 'created' as const, ...stored };
    },
    async lookup(key: string) {
      return effects.get(key) ?? null;
    },
  };
}
