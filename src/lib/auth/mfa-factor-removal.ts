import { ApiError } from '@/lib/errors';

type Input = { userId: string; role: string | null; factorId: string };

type Dependencies = {
  operationId(): string;
  reserve(userId: string, factorId: string, operationId: string): Promise<boolean>;
  release(userId: string, factorId: string, operationId: string): Promise<void>;
  listVerifiedFactorIds(): Promise<string[]>;
  unenroll(factorId: string): Promise<void>;
};

function requiresMfa(role: string | null): boolean {
  return role === 'super_admin' || role === 'admin' || role === 'pro';
}

export async function removeMfaFactorWithInvariant(
  input: Input,
  dependencies: Dependencies,
): Promise<void> {
  const deps = dependencies;
  if (!requiresMfa(input.role)) {
    await deps.unenroll(input.factorId);
    return;
  }

  const operationId = deps.operationId();
  const reserved = await deps.reserve(input.userId, input.factorId, operationId);
  if (!reserved) {
    throw new ApiError(
      'MFA_MUTATION_IN_PROGRESS',
      'Another MFA change is already in progress',
      409,
    );
  }

  try {
    const verified = await deps.listVerifiedFactorIds();
    if (verified.includes(input.factorId) && verified.length <= 1) {
      throw new ApiError(
        'MFA_REQUIRED',
        'MFA is mandatory for this role; add another factor first',
        409,
      );
    }
    await deps.unenroll(input.factorId);
  } finally {
    await deps.release(input.userId, input.factorId, operationId);
  }
}
