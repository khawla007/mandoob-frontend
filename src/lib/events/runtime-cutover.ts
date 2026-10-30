export type EventRuntimeCutoverMode = 'legacy' | 'event-runtime';

const EVENT_RUNTIME_ONLY = 'event-runtime-only';

export function parseEventRuntimeCutover(value: string | undefined): EventRuntimeCutoverMode {
  return value === EVENT_RUNTIME_ONLY ? 'event-runtime' : 'legacy';
}

export function eventRuntimeEnabled(value: string | undefined): boolean {
  return parseEventRuntimeCutover(value) === 'event-runtime';
}

export function legacyEventWorkersAllowed(value: string | undefined): boolean {
  return parseEventRuntimeCutover(value) === 'legacy';
}
