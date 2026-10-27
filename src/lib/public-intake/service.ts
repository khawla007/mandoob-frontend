import 'server-only';

import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import type { NormalizedContactPayload } from '@/lib/public-contact/contracts';
import { hashRequest } from './security';

export type AcceptContactInput = {
  operationId: string;
  contact: NormalizedContactPayload;
  abuseScopeHash: string;
  acceptedAt: string;
};

export type ContactAcceptance = {
  contactId: string;
  accepted: true;
  deliveryState: 'pending' | 'suppressed' | 'unavailable' | 'delivered';
};

export async function acceptPublicContact(input: AcceptContactInput): Promise<ContactAcceptance> {
  const admin = createSupabaseServiceRoleClient();
  const requestHash = hashRequest({
    contact: input.contact,
    consentVersion: 'public-contact-v1',
  });
  const { data, error } = await admin.rpc(
    'accept_public_contact' as never,
    {
      p_operation_id: input.operationId,
      p_request_hash: requestHash,
      p_normalized_payload: input.contact,
      p_consent_version: 'public-contact-v1',
      p_consent_accepted_at: input.acceptedAt,
      p_abuse_scope_hash: input.abuseScopeHash,
    } as never,
  );
  if (error || !data) throw new Error('CONTACT_ACCEPTANCE_UNAVAILABLE');
  return data as unknown as ContactAcceptance;
}
