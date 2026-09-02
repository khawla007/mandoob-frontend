export type SourceState<T> = { status: 'ready'; data: T } | { status: 'unavailable' };

export type RedactedProviderConfig = {
  enabled: boolean;
  hasCredential: boolean;
};

export type ProviderState =
  | 'not_configured'
  | 'configured'
  | 'enabled'
  | 'misconfigured'
  | 'unavailable';

/** Derives a display state from persisted, redacted configuration only. */
export function deriveProviderState(
  source: SourceState<RedactedProviderConfig | null>,
): ProviderState {
  if (source.status === 'unavailable') return 'unavailable';
  if (!source.data) return 'not_configured';
  if (source.data.enabled && !source.data.hasCredential) return 'misconfigured';
  if (source.data.enabled) return 'enabled';
  return 'configured';
}
