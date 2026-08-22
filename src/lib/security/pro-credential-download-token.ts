import { z } from 'zod';

const PURPOSE = 'pro-credential-evidence-download';
export const PRO_CREDENTIAL_DOWNLOAD_TTL_SECONDS = 300;

const payloadSchema = z
  .object({
    version: z.literal(1),
    purpose: z.literal(PURPOSE),
    evidenceId: z.string().uuid(),
    issuedAt: z.number().int().nonnegative(),
    expiresAt: z.number().int().positive(),
  })
  .strict();

type CryptoDeps = {
  encrypt(value: string): string;
  decrypt(value: string): string;
};

async function cryptoDefaults(): Promise<CryptoDeps> {
  const { encrypt, decrypt } = await import('@/lib/crypto/pii');
  return { encrypt, decrypt };
}

export async function issueProCredentialDownloadToken(
  evidenceId: string,
  now = new Date(),
  crypto?: CryptoDeps,
): Promise<string> {
  const dependency = crypto ?? (await cryptoDefaults());
  const issuedAt = Math.floor(now.getTime() / 1000);
  const encrypted = dependency.encrypt(
    JSON.stringify({
      version: 1,
      purpose: PURPOSE,
      evidenceId,
      issuedAt,
      expiresAt: issuedAt + PRO_CREDENTIAL_DOWNLOAD_TTL_SECONDS,
    }),
  );
  return Buffer.from(encrypted, 'utf8').toString('base64url');
}

export async function verifyProCredentialDownloadToken(
  token: string,
  now = new Date(),
  crypto?: CryptoDeps,
): Promise<string> {
  if (token.length > 4096 || !/^[A-Za-z0-9_-]+$/u.test(token)) throw new Error('INVALID_TOKEN');
  const dependency = crypto ?? (await cryptoDefaults());
  const decoded = Buffer.from(token, 'base64url');
  if (decoded.toString('base64url') !== token) throw new Error('INVALID_TOKEN');
  const parsed = payloadSchema.parse(JSON.parse(dependency.decrypt(decoded.toString('utf8'))));
  const nowSeconds = Math.floor(now.getTime() / 1000);
  if (
    parsed.expiresAt !== parsed.issuedAt + PRO_CREDENTIAL_DOWNLOAD_TTL_SECONDS ||
    parsed.issuedAt > nowSeconds + 5 ||
    parsed.expiresAt <= nowSeconds
  )
    throw new Error('INVALID_TOKEN');
  return parsed.evidenceId;
}
