import 'server-only';

import { z } from 'zod';

import { ApiError } from '@/lib/errors';

type CredentialIdentifierRecord = {
  proProfileId: string;
  identifierCiphertext: string;
};

type DecisionReasonDeps = {
  loadCredential(credentialId: string): Promise<CredentialIdentifierRecord | null>;
  decryptIdentifier(ciphertext: string): string | Promise<string>;
};

const uuid = z.string().uuid();

async function loadCredential(credentialId: string): Promise<CredentialIdentifierRecord | null> {
  const { createSupabaseServiceRoleClient } = await import('@/lib/supabase/service-role');
  const { data, error } = await createSupabaseServiceRoleClient()
    .from('pro_credentials')
    .select('pro_profile_id, identifier_ciphertext')
    .eq('id', credentialId)
    .maybeSingle();
  if (error) throw new Error('credential_identifier_lookup_failed');
  if (!data) return null;
  if (typeof data.pro_profile_id !== 'string' || typeof data.identifier_ciphertext !== 'string')
    throw new Error('credential_identifier_shape_invalid');
  return {
    proProfileId: data.pro_profile_id,
    identifierCiphertext: data.identifier_ciphertext,
  };
}

async function decryptIdentifier(ciphertext: string): Promise<string> {
  return (await import('@/lib/crypto/pii')).decrypt(ciphertext);
}

const defaults: DecisionReasonDeps = { loadCredential, decryptIdentifier };

function canonicalIdentifier(value: string): string {
  return value
    .normalize('NFKC')
    .toUpperCase()
    .replace(/[^A-Z0-9]/gu, '');
}

export async function assertDecisionReasonExcludesCredentialIdentifier(
  proProfileId: string,
  credentialId: string,
  reason: string,
  deps: DecisionReasonDeps = defaults,
): Promise<void> {
  const parsedProProfileId = uuid.parse(proProfileId);
  const parsedCredentialId = uuid.parse(credentialId);
  let credential: CredentialIdentifierRecord | null;
  try {
    credential = await deps.loadCredential(parsedCredentialId);
  } catch {
    throw new ApiError('INTERNAL', 'Unable to validate decision reason', 500);
  }
  if (!credential || credential.proProfileId !== parsedProProfileId)
    throw new ApiError('NOT_FOUND', 'Unable to validate decision reason', 404);

  let identifier: string;
  try {
    identifier = canonicalIdentifier(await deps.decryptIdentifier(credential.identifierCiphertext));
  } catch {
    throw new ApiError('INTERNAL', 'Unable to validate decision reason', 500);
  }
  const canonicalReason = canonicalIdentifier(reason);
  if (identifier.length >= 4 && canonicalReason.includes(identifier))
    throw new ApiError('DECISION_REASON_INVALID', 'Unable to validate decision reason', 422);
}
