export type RecoveryCodeDependencies = {
  listUnused: (userId: string) => Promise<Array<{ id: string; codeHash: string }>>;
  verify: (codeHash: string, code: string) => Promise<boolean>;
  claim: (id: string, usedAt: string) => Promise<boolean>;
};

export async function redeemRecoveryCodeWithDependencies(
  userId: string,
  code: string,
  dependencies: RecoveryCodeDependencies,
): Promise<boolean> {
  try {
    const rows = await dependencies.listUnused(userId);
    for (const row of rows) {
      if (await dependencies.verify(row.codeHash, code)) {
        return await dependencies.claim(row.id, new Date().toISOString());
      }
    }
  } catch {
    return false;
  }
  return false;
}

export type RecoveryResetDependencies = {
  revokeSessions: (userId: string) => Promise<void>;
  deleteRecoveryCodes: (userId: string) => Promise<void>;
  listFactorIds: (userId: string) => Promise<string[]>;
  deleteFactor: (factorId: string, userId: string) => Promise<void>;
  clearEnrollment: (userId: string) => Promise<void>;
};

export async function resetMfaForRecoveryWithDependencies(
  userId: string,
  dependencies: RecoveryResetDependencies,
): Promise<'complete' | 'repair_required'> {
  try {
    await dependencies.revokeSessions(userId);
    await dependencies.deleteRecoveryCodes(userId);
    const factorIds = await dependencies.listFactorIds(userId);
    for (const factorId of factorIds) await dependencies.deleteFactor(factorId, userId);
    await dependencies.clearEnrollment(userId);
    return 'complete';
  } catch {
    return 'repair_required';
  }
}

export type RecoveryCodeReplacementDependencies = {
  deleteExisting: (userId: string) => Promise<void>;
  hash: (code: string) => Promise<string>;
  insert: (rows: Array<{ user_id: string; code_hash: string }>) => Promise<void>;
};

export async function replaceRecoveryCodesWithDependencies(
  userId: string,
  codes: string[],
  dependencies: RecoveryCodeReplacementDependencies,
): Promise<void> {
  await dependencies.deleteExisting(userId);
  const rows = await Promise.all(
    codes.map(async (code) => ({ user_id: userId, code_hash: await dependencies.hash(code) })),
  );
  await dependencies.insert(rows);
}

export type EnrollmentFinalizationDependencies = {
  persistCodes: (userId: string, codes: string[]) => Promise<void>;
  markEnrolled: (userId: string) => Promise<void>;
  revokeSessions: (userId: string) => Promise<void>;
  deleteCodes: (userId: string) => Promise<void>;
  removeFactor: (factorId: string) => Promise<void>;
  clearEnrollment: (userId: string) => Promise<void>;
};

export type EnrollmentFinalizationResult = 'complete' | 'failed_clean' | 'repair_required';

export async function finalizeMfaEnrollmentWithDependencies(
  userId: string,
  factorId: string,
  codes: string[],
  dependencies: EnrollmentFinalizationDependencies,
): Promise<EnrollmentFinalizationResult> {
  try {
    await dependencies.persistCodes(userId, codes);
    await dependencies.markEnrolled(userId);
    return 'complete';
  } catch {
    let cleanupFailed = false;
    for (const cleanup of [
      () => dependencies.revokeSessions(userId),
      () => dependencies.deleteCodes(userId),
      () => dependencies.removeFactor(factorId),
      () => dependencies.clearEnrollment(userId),
    ]) {
      try {
        await cleanup();
      } catch {
        cleanupFailed = true;
      }
    }
    return cleanupFailed ? 'repair_required' : 'failed_clean';
  }
}

export type EnrollmentCleanupDependencies = {
  listTotpFactors: () => Promise<Array<{ id: string; status: string }>>;
  removeFactor: (factorId: string) => Promise<void>;
};

export async function cleanupUnverifiedTotpFactors(
  dependencies: EnrollmentCleanupDependencies,
): Promise<boolean> {
  try {
    const factors = await dependencies.listTotpFactors();
    for (const factor of factors) {
      if (factor.status === 'unverified') await dependencies.removeFactor(factor.id);
    }
    return true;
  } catch {
    return false;
  }
}
export function canStartMfaEnrollment(
  currentLevel: string | null,
  nextLevel: string | null,
  hasVerifiedFactor: boolean,
): boolean {
  return !(hasVerifiedFactor || nextLevel === 'aal2') || currentLevel === 'aal2';
}

export async function runAuthorizedMfaEnrollmentMutation<T>(dependencies: {
  loadFactors: () => Promise<Array<{ id: string; status: string; type?: string }>>;
  loadAssurance: () => Promise<{ currentLevel: string | null; nextLevel: string | null }>;
  mutate: (factors: Array<{ id: string; status: string; type?: string }>) => Promise<T>;
}): Promise<
  { kind: 'allowed'; value: T } | { kind: 'challenge_required' } | { kind: 'authorization_failed' }
> {
  try {
    const [factors, assurance] = await Promise.all([
      dependencies.loadFactors(),
      dependencies.loadAssurance(),
    ]);
    if (
      !canStartMfaEnrollment(
        assurance.currentLevel,
        assurance.nextLevel,
        factors.some((factor) => factor.status === 'verified'),
      )
    ) {
      return { kind: 'challenge_required' };
    }
    return { kind: 'allowed', value: await dependencies.mutate(factors) };
  } catch {
    return { kind: 'authorization_failed' };
  }
}

export async function runVerifiedMfaChallengeMutation<T>(
  factorId: string,
  dependencies: {
    loadFactors: () => Promise<Array<{ id: string; status: string }>>;
    mutate: () => Promise<T>;
  },
): Promise<
  { kind: 'allowed'; value: T } | { kind: 'factor_rejected' } | { kind: 'authorization_failed' }
> {
  try {
    const factors = await dependencies.loadFactors();
    if (!factors.some((factor) => factor.id === factorId && factor.status === 'verified')) {
      return { kind: 'factor_rejected' };
    }
    return { kind: 'allowed', value: await dependencies.mutate() };
  } catch {
    return { kind: 'authorization_failed' };
  }
}
