export type SecretPrerequisiteResult =
  | { ok: true }
  | { ok: false; reason: 'unavailable' | 'missing' };

/** Reads the current secret before any write; a failed read must block the mutation. */
export async function resolveSecretPrerequisite({
  replacementSecret,
  readExisting,
  encrypt,
  mutate,
}: {
  replacementSecret: string;
  readExisting: () => Promise<{ secret: string | null; unavailable: boolean }>;
  encrypt: (value: string) => string;
  mutate: (secret: string) => Promise<void>;
}): Promise<SecretPrerequisiteResult> {
  const existing = await readExisting();
  if (existing.unavailable) return { ok: false, reason: 'unavailable' };
  const secret = replacementSecret.trim() ? encrypt(replacementSecret.trim()) : existing.secret;
  if (!secret) return { ok: false, reason: 'missing' };
  await mutate(secret);
  return { ok: true };
}
