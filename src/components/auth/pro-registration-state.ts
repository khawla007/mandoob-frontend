export const PRO_REGISTRATION_STATES = [
  'ready',
  'unavailable',
  'validation',
  'pending',
  'review',
  'duplicate',
  'rate',
  'error',
  'success',
] as const;

export type ProRegistrationState = (typeof PRO_REGISTRATION_STATES)[number];

type RuntimeEnvironment = 'development' | 'production' | 'test';

export function resolveProRegistrationState(
  rawState: string | string[] | undefined,
  environment: RuntimeEnvironment,
): { state: ProRegistrationState; presentationOnly: boolean } {
  if (environment === 'production') {
    return { state: 'unavailable', presentationOnly: false };
  }

  const state = typeof rawState === 'string' ? rawState : undefined;
  const isAllowed = PRO_REGISTRATION_STATES.some((candidate) => candidate === state);

  return {
    state: isAllowed ? (state as ProRegistrationState) : 'ready',
    presentationOnly: true,
  };
}
