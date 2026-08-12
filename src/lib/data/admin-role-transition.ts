import { ApiError } from '@/lib/errors';
import type { Role } from '@/lib/auth/roles';
import type { ProfileStatus } from './admin-edit-helpers';

export type RoleMetadataClaims = {
  mandoob_role: Role | null;
  tenant_id: string | null;
  mandoob_status: ProfileStatus;
  mandoob_role_transition: 'pending' | null;
};

export type RoleMetadataSnapshot = {
  claims: RoleMetadataClaims;
  version: string;
};

type DatabaseError = { message: string };
type FailureStage =
  | 'initial_revoke'
  | 'neutral_metadata'
  | 'neutral_revoke'
  | 'database_change'
  | 'restore_metadata'
  | 'final_metadata'
  | 'final_revoke'
  | 'resync_disable'
  | 'pre_final_revalidation'
  | 'post_final_revalidation'
  | 'conflict_neutral_metadata'
  | 'conflict_revoke'
  | 'rollback_revalidation'
  | 'rollback_neutral_metadata'
  | 'rollback_revoke'
  | 'restore_revoke'
  | 'finalization_neutral_metadata'
  | 'finalization_revoke';

export class AtomicRoleChangeError extends Error {
  constructor(readonly databaseError: DatabaseError) {
    super('Atomic database role change failed');
  }
}

export function isRoleMetadataResyncSourceSafe(
  appMetadata: Record<string, unknown>,
  currentClaims: RoleMetadataClaims,
): boolean {
  if (appMetadata.mandoob_role_transition === 'pending') return true;
  return (
    appMetadata.mandoob_role === currentClaims.mandoob_role &&
    (appMetadata.tenant_id ?? null) === currentClaims.tenant_id &&
    appMetadata.mandoob_status === currentClaims.mandoob_status
  );
}

function roleMetadataSnapshotMatches(
  snapshot: RoleMetadataSnapshot | null,
  claims: RoleMetadataClaims,
  version: string,
): boolean {
  return (
    snapshot !== null &&
    snapshot.version === version &&
    snapshot.claims.mandoob_role === claims.mandoob_role &&
    snapshot.claims.tenant_id === claims.tenant_id &&
    snapshot.claims.mandoob_status === claims.mandoob_status
  );
}

type FailClosedPolicy = {
  lockCode: string;
  lockMessage: string;
  conflictCode: string;
  conflictMessage: string;
  operationalCode: string;
  operationalMessage: string;
  neutralStage: FailureStage;
  revokeStage: FailureStage;
};

async function failClosedAfterSnapshotConflict(args: {
  latest: RoleMetadataSnapshot | null;
  fallbackClaims: RoleMetadataClaims;
  operationalFailure: boolean;
  writeMetadata(claims: RoleMetadataClaims): Promise<void>;
  revoke(): Promise<void>;
  report(stage: FailureStage, error: unknown): void;
  policy: FailClosedPolicy;
}): Promise<never> {
  const neutralClaims: RoleMetadataClaims = {
    mandoob_role: null,
    tenant_id: null,
    mandoob_status: args.latest?.claims.mandoob_status ?? args.fallbackClaims.mandoob_status,
    mandoob_role_transition: 'pending',
  };
  let neutralError: unknown;
  let revokeError: unknown;
  try {
    await args.writeMetadata(neutralClaims);
  } catch (error) {
    neutralError = error;
    args.report(args.policy.neutralStage, error);
  }
  try {
    await args.revoke();
  } catch (error) {
    revokeError = error;
    args.report(args.policy.revokeStage, error);
  }
  if (neutralError || revokeError) {
    throw new ApiError(args.policy.lockCode, args.policy.lockMessage, 502);
  }
  throw new ApiError(
    args.operationalFailure ? args.policy.operationalCode : args.policy.conflictCode,
    args.operationalFailure ? args.policy.operationalMessage : args.policy.conflictMessage,
    args.operationalFailure ? 502 : 409,
  );
}

async function revalidateSnapshot(args: {
  expected: RoleMetadataSnapshot;
  fallbackClaims: RoleMetadataClaims;
  stage: FailureStage;
  readCurrentSnapshot(): Promise<RoleMetadataSnapshot | null>;
  writeMetadata(claims: RoleMetadataClaims): Promise<void>;
  revoke(): Promise<void>;
  report(stage: FailureStage, error: unknown): void;
  policy: FailClosedPolicy;
}): Promise<void> {
  let current: RoleMetadataSnapshot | null;
  try {
    current = await args.readCurrentSnapshot();
  } catch (error) {
    args.report(args.stage, error);
    return failClosedAfterSnapshotConflict({
      ...args,
      latest: null,
      operationalFailure: true,
    });
  }
  if (!roleMetadataSnapshotMatches(current, args.expected.claims, args.expected.version)) {
    args.report(args.stage, new Error('Profile authorization snapshot changed'));
    return failClosedAfterSnapshotConflict({
      ...args,
      latest: current,
      operationalFailure: false,
    });
  }
}

export async function executeRoleChangeTransition(args: {
  oldClaims: RoleMetadataClaims;
  oldVersion: string;
  newClaims: RoleMetadataClaims;
  revoke(): Promise<void>;
  writeMetadata(claims: RoleMetadataClaims): Promise<void>;
  changeDatabase(): Promise<{
    error: DatabaseError | null;
    committedSnapshot: RoleMetadataSnapshot | null;
  }>;
  readCurrentSnapshot(): Promise<RoleMetadataSnapshot | null>;
  reportFailure?: (stage: FailureStage, error: unknown) => void;
}): Promise<void> {
  const report = args.reportFailure ?? (() => {});
  const neutralClaims: RoleMetadataClaims = {
    mandoob_role: null,
    tenant_id: null,
    mandoob_status: args.oldClaims.mandoob_status,
    mandoob_role_transition: 'pending',
  };

  try {
    await args.revoke();
  } catch (error) {
    report('initial_revoke', error);
    throw new ApiError('SESSION_REVOKE_FAILED', 'Could not revoke user sessions', 502);
  }

  try {
    await args.writeMetadata(neutralClaims);
  } catch (error) {
    report('neutral_metadata', error);
    throw new ApiError(
      'AUTH_METADATA_NEUTRALIZE_FAILED',
      'Could not disable user authorization before the role change',
      502,
    );
  }

  try {
    await args.revoke();
  } catch (error) {
    report('neutral_revoke', error);
    throw new ApiError(
      'SESSION_REVOKE_FAILED',
      'Could not confirm user session revocation; authorization remains disabled',
      502,
    );
  }

  let databaseResult: {
    error: DatabaseError | null;
    committedSnapshot: RoleMetadataSnapshot | null;
  };
  try {
    databaseResult = await args.changeDatabase();
  } catch (error) {
    report('database_change', error);
    databaseResult = {
      error: { message: error instanceof Error ? error.message : 'Unexpected database failure' },
      committedSnapshot: null,
    };
  }
  const databaseError = databaseResult.error;
  if (databaseError) {
    report('database_change', databaseError);
    const oldSnapshot = { claims: args.oldClaims, version: args.oldVersion };
    const rollbackPolicy: FailClosedPolicy = {
      lockCode: 'ROLE_CHANGE_ROLLBACK_LOCK_FAILED',
      lockMessage:
        'Database role change failed and fail-closed recovery failed; contact support immediately',
      conflictCode: 'ROLE_CHANGE_STATE_CONFLICT',
      conflictMessage:
        'Profile changed while the database role change was running; login remains disabled',
      operationalCode: 'ROLE_CHANGE_REVALIDATION_FAILED',
      operationalMessage:
        'Could not revalidate the profile after the database role change failed; login remains disabled',
      neutralStage: 'rollback_neutral_metadata',
      revokeStage: 'rollback_revoke',
    };
    await revalidateSnapshot({
      expected: oldSnapshot,
      fallbackClaims: args.oldClaims,
      stage: 'rollback_revalidation',
      readCurrentSnapshot: args.readCurrentSnapshot,
      writeMetadata: args.writeMetadata,
      revoke: args.revoke,
      report,
      policy: rollbackPolicy,
    });
    if (args.oldClaims.mandoob_status !== 'active' && args.oldClaims.mandoob_status !== 'invited') {
      return failClosedAfterSnapshotConflict({
        latest: oldSnapshot,
        fallbackClaims: args.oldClaims,
        operationalFailure: false,
        writeMetadata: args.writeMetadata,
        revoke: args.revoke,
        report,
        policy: rollbackPolicy,
      });
    }
    try {
      await args.writeMetadata(args.oldClaims);
    } catch (error) {
      report('restore_metadata', error);
      throw new ApiError(
        'ROLE_CHANGE_RESTORE_FAILED',
        'The database role change failed and prior authorization metadata could not be restored; the user remains signed out',
        502,
      );
    }
    await revalidateSnapshot({
      expected: oldSnapshot,
      fallbackClaims: args.oldClaims,
      stage: 'rollback_revalidation',
      readCurrentSnapshot: args.readCurrentSnapshot,
      writeMetadata: args.writeMetadata,
      revoke: args.revoke,
      report,
      policy: rollbackPolicy,
    });
    try {
      await args.revoke();
    } catch (error) {
      report('restore_revoke', error);
      let neutralError: unknown;
      let secondRevokeError: unknown;
      try {
        await args.writeMetadata(neutralClaims);
      } catch (disableError) {
        neutralError = disableError;
        report('rollback_neutral_metadata', disableError);
      }
      try {
        await args.revoke();
      } catch (secondError) {
        secondRevokeError = secondError;
        report('rollback_revoke', secondError);
      }
      if (neutralError || secondRevokeError) {
        throw new ApiError(
          'ROLE_CHANGE_ROLLBACK_LOCK_FAILED',
          'Prior authorization was restored but fail-closed session recovery failed; contact support immediately',
          502,
        );
      }
      throw new ApiError(
        'ROLE_CHANGE_RESTORE_REVOKE_FAILED',
        'Prior authorization could not be safely restored; login remains disabled',
        502,
      );
    }
    throw new AtomicRoleChangeError(databaseError);
  }

  const committedSnapshot = databaseResult.committedSnapshot;
  const finalizationPolicy: FailClosedPolicy = {
    lockCode: 'ROLE_CHANGE_FINALIZATION_LOCK_FAILED',
    lockMessage:
      'Role finalization failed and fail-closed recovery failed; contact support immediately',
    conflictCode: 'ROLE_CHANGE_STATE_CONFLICT',
    conflictMessage:
      'Profile changed while role metadata was being finalized; login remains disabled',
    operationalCode: 'ROLE_CHANGE_REVALIDATION_FAILED',
    operationalMessage: 'Could not revalidate the committed profile; login remains disabled',
    neutralStage: 'finalization_neutral_metadata',
    revokeStage: 'finalization_revoke',
  };
  if (
    !committedSnapshot ||
    committedSnapshot.claims.mandoob_role !== args.newClaims.mandoob_role ||
    committedSnapshot.claims.tenant_id !== args.newClaims.tenant_id ||
    committedSnapshot.claims.mandoob_status !== args.newClaims.mandoob_status
  ) {
    report('pre_final_revalidation', new Error('RPC returned an invalid committed snapshot'));
    return failClosedAfterSnapshotConflict({
      latest: committedSnapshot,
      fallbackClaims: args.newClaims,
      operationalFailure: committedSnapshot === null,
      writeMetadata: args.writeMetadata,
      revoke: args.revoke,
      report,
      policy: finalizationPolicy,
    });
  }
  await revalidateSnapshot({
    expected: committedSnapshot,
    fallbackClaims: args.newClaims,
    stage: 'pre_final_revalidation',
    readCurrentSnapshot: args.readCurrentSnapshot,
    writeMetadata: args.writeMetadata,
    revoke: args.revoke,
    report,
    policy: finalizationPolicy,
  });

  try {
    await args.writeMetadata(committedSnapshot.claims);
  } catch (error) {
    report('final_metadata', error);
    throw new ApiError(
      'AUTH_METADATA_SYNC_FAILED',
      'Role changed, but login remains disabled. Use “Resync login access” on the user’s admin page.',
      502,
    );
  }
  await revalidateSnapshot({
    expected: committedSnapshot,
    fallbackClaims: args.newClaims,
    stage: 'post_final_revalidation',
    readCurrentSnapshot: args.readCurrentSnapshot,
    writeMetadata: args.writeMetadata,
    revoke: args.revoke,
    report,
    policy: finalizationPolicy,
  });
}

export async function executeRoleMetadataResync(args: {
  currentClaims: RoleMetadataClaims;
  currentVersion: string;
  revoke(): Promise<void>;
  writeMetadata(claims: RoleMetadataClaims): Promise<void>;
  readCurrentSnapshot(): Promise<RoleMetadataSnapshot | null>;
  reportFailure?: (stage: FailureStage, error: unknown) => void;
}): Promise<void> {
  const report = args.reportFailure ?? (() => {});
  const neutralClaims: RoleMetadataClaims = {
    mandoob_role: null,
    tenant_id: null,
    mandoob_status: args.currentClaims.mandoob_status,
    mandoob_role_transition: 'pending',
  };
  const resyncPolicy: FailClosedPolicy = {
    lockCode: 'ROLE_METADATA_RESYNC_LOCK_FAILED',
    lockMessage:
      'Profile revalidation failed and fail-closed recovery failed; contact support immediately',
    conflictCode: 'ROLE_METADATA_STATE_CONFLICT',
    conflictMessage: 'Profile changed during metadata resynchronization; login remains disabled',
    operationalCode: 'ROLE_METADATA_REVALIDATION_FAILED',
    operationalMessage: 'Could not revalidate the current profile; login remains disabled',
    neutralStage: 'conflict_neutral_metadata',
    revokeStage: 'conflict_revoke',
  };
  const currentSnapshot = { claims: args.currentClaims, version: args.currentVersion };

  try {
    await args.revoke();
  } catch (error) {
    report('initial_revoke', error);
    throw new ApiError('SESSION_REVOKE_FAILED', 'Could not revoke user sessions', 502);
  }

  try {
    await args.writeMetadata(neutralClaims);
  } catch (error) {
    report('neutral_metadata', error);
    throw new ApiError(
      'AUTH_METADATA_NEUTRALIZE_FAILED',
      'Could not disable user authorization before metadata synchronization',
      502,
    );
  }
  try {
    await args.revoke();
  } catch (error) {
    report('neutral_revoke', error);
    throw new ApiError(
      'SESSION_REVOKE_FAILED',
      'Could not confirm user session revocation; authorization remains disabled',
      502,
    );
  }

  await revalidateSnapshot({
    expected: currentSnapshot,
    fallbackClaims: args.currentClaims,
    stage: 'pre_final_revalidation',
    readCurrentSnapshot: args.readCurrentSnapshot,
    writeMetadata: args.writeMetadata,
    revoke: args.revoke,
    report,
    policy: resyncPolicy,
  });

  try {
    await args.writeMetadata(args.currentClaims);
  } catch (error) {
    report('final_metadata', error);
    throw new ApiError(
      'AUTH_METADATA_SYNC_FAILED',
      'Login remains disabled. Use “Resync login access” on the user’s admin page to retry.',
      502,
    );
  }

  await revalidateSnapshot({
    expected: currentSnapshot,
    fallbackClaims: args.currentClaims,
    stage: 'post_final_revalidation',
    readCurrentSnapshot: args.readCurrentSnapshot,
    writeMetadata: args.writeMetadata,
    revoke: args.revoke,
    report,
    policy: resyncPolicy,
  });

  try {
    await args.revoke();
  } catch (error) {
    report('final_revoke', error);
    try {
      await args.writeMetadata(neutralClaims);
    } catch (disableError) {
      report('resync_disable', disableError);
      throw new ApiError(
        'ROLE_METADATA_RESYNC_LOCK_FAILED',
        'Metadata was synchronized, but session revocation and authorization lockout both failed; contact support immediately',
        502,
      );
    }
    throw new ApiError(
      'SESSION_REVOKE_FAILED',
      'Could not finalize session revocation; authorization remains disabled',
      502,
    );
  }
}
