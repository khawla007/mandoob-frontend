import 'server-only';

import type { ConsentState } from '@/lib/comms/consent';

export type CustomerCommunicationConsent =
  | { kind: 'opted-out'; channels: Array<'whatsapp' | 'sms'> }
  | { kind: 'unavailable' };

type Dependencies = {
  readConsent?: (phone: string) => Promise<ConsentState>;
};

export async function loadCustomerCommunicationConsent(
  phone: string | null | undefined,
  dependencies: Dependencies = {},
): Promise<CustomerCommunicationConsent> {
  if (!phone) return { kind: 'unavailable' };
  try {
    const readConsent =
      dependencies.readConsent ?? (await import('@/lib/comms/consent')).getConsentStateForPhone;
    const state = await readConsent(phone);
    const channels = (['whatsapp', 'sms'] as const).filter((channel) => state[channel]);
    return channels.length > 0 ? { kind: 'opted-out', channels } : { kind: 'unavailable' };
  } catch {
    return { kind: 'unavailable' };
  }
}
