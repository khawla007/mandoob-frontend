import 'server-only';

export type SmsProviderName = 'unifonic' | 'twilio';

export type ProviderAvailability = {
  unifonic: boolean;
  twilio: boolean;
};

const E164 = /^\+[1-9]\d{6,14}$/;

export class InvalidPhoneError extends Error {
  constructor(phone: string) {
    super(`invalid E.164 phone: ${phone}`);
  }
}

export class NoProviderConfiguredError extends Error {
  constructor() {
    super('no SMS provider configured');
  }
}

// Country-code routing: +971 → Unifonic (MENA), everything else → Twilio.
// When only one provider is configured, use it for all numbers.
export function pickProvider(toPhone: string, available: ProviderAvailability): SmsProviderName {
  if (!E164.test(toPhone)) throw new InvalidPhoneError(toPhone);
  if (!available.unifonic && !available.twilio) throw new NoProviderConfiguredError();
  if (!available.unifonic) return 'twilio';
  if (!available.twilio) return 'unifonic';
  return toPhone.startsWith('+971') ? 'unifonic' : 'twilio';
}
