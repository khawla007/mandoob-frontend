import 'server-only';

import type { RegistrationPresentation, RegistrationSourceState } from './contracts';

const registrationUnavailable = {
  kind: 'unavailable',
  reason: 'registration_contract_unavailable',
} as const;

const visaUnavailable = {
  kind: 'unavailable',
  reason: 'visa_contract_unavailable',
} as const;

export async function loadRegistrationIndex(): Promise<
  RegistrationSourceState<RegistrationPresentation[]>
> {
  return registrationUnavailable;
}

export async function loadRegistrationPresentation(): Promise<
  RegistrationSourceState<RegistrationPresentation>
> {
  return registrationUnavailable;
}

export async function loadVisaPresentation(): Promise<
  RegistrationSourceState<RegistrationPresentation['visaPeople']>
> {
  return visaUnavailable;
}
