const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function assertIdentifier(value: string): void {
  if (!UUID.test(value)) throw new Error('Invalid credential path identifier');
}

export function buildProCredentialEvidencePath(
  proProfileId: string,
  credentialId: string,
  evidenceId: string,
): string {
  assertIdentifier(proProfileId);
  assertIdentifier(credentialId);
  assertIdentifier(evidenceId);
  return `pro-credentials/${proProfileId}/${credentialId}/${evidenceId}`;
}

export function isOwnedProCredentialEvidencePath(
  path: string,
  proProfileId: string,
  credentialId: string,
  evidenceId: string,
): boolean {
  try {
    return path === buildProCredentialEvidencePath(proProfileId, credentialId, evidenceId);
  } catch {
    return false;
  }
}
