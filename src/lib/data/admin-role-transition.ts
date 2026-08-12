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
  | 'restore_revoke';

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

export async function executeRoleChangeTransition(args: {
  oldClaims: RoleMetadataClaims;
  oldVersion: string;
  newClaims: RoleMetadataClaims;
  revoke(): Promise<void>;
  writeMetadata(claims: RoleMetadataClaims): Promise<void>;
  changeDatabase(): Promise<DatabaseError | null>;
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

  let databaseError: DatabaseError | null;
  try {
    databaseError = await args.changeDatabase();
  } catch (error) {
    report('database_change', error);
    databaseError = {
      message: error instanceof Error ? error.message : 'Unexpected database failure',
    };
  }
  if (databaseError) {
    report('database_change', databaseError);
    let currentSnapshot: RoleMetadataSnapshot | null = null;
    let revalidationFailed = false;
    try {
      currentSnapshot = await args.readCurrentSnapshot();
    } catch (error) {
      revalidationFailed = true;
      report('rollback_revalidation', error);
    }
    const statusPermitsRestore =
      currentSnapshot?.claims.mandoob_status === 'active' ||
      currentSnapshot?.claims.mandoob_status === 'invited';
    if (
      revalidationFailed ||
      !statusPermitsRestore ||
      !roleMetadataSnapshotMatches(currentSnapshot, args.oldClaims, args.oldVersion)
    ) {
      const rollbackNeutralClaims: RoleMetadataClaims = {
        mandoob_role: null,
        tenant_id: null,
        mandoob_status: currentSnapshot?.claims.mandoob_status ?? args.oldClaims.mandoob_status,
        mandoob_role_transition: 'pending',
      };
      let neutralError: unknown;
      let revokeError: unknown;
      try {
        await args.writeMetadata(rollbackNeutralClaims);
      } catch (error) {
        neutralError = error;
        report('rollback_neutral_metadata', error);
      }
      try {
        await args.revoke();
      } catch (error) {
        revokeError = error;
        report('rollback_revoke', error);
      }
      if (neutralError || revokeError) {
        throw new ApiError(
          'ROLE_CHANGE_ROLLBACK_LOCK_FAILED',
          'Database role change failed and fail-closed recovery failed; contact support immediately',
          502,
        );
      }
      throw new ApiError(
        revalidationFailed ? 'ROLE_CHANGE_REVALIDATION_FAILED' : 'ROLE_CHANGE_STATE_CONFLICT',
        revalidationFailed
          ? 'Could not revalidate the profile after the database role change failed; login remains disabled'
          : 'Profile changed while the database role change was running; login remains disabled',
        revalidationFailed ? 502 : 409,
      );
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

  try {
    await args.writeMetadata(args.newClaims);
  } catch (error) {
    report('final_metadata', error);
    throw new ApiError(
      'AUTH_METADATA_SYNC_FAILED',
      'Role changed, but login remains disabled. Use “Resync login access” on the user’s admin page.',
      502,
    );
  }
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

  async function failClosedAfterRevalidation(
    latest: RoleMetadataSnapshot | null,
    operationalFailure: boolean,
  ): Promise<never> {
    const latestNeutralClaims: RoleMetadataClaims = {
      mandoob_role: null,
      tenant_id: null,
      mandoob_status: latest?.claims.mandoob_status ?? args.currentClaims.mandoob_status,
      mandoob_role_transition: 'pending',
    };
    let neutralError: unknown;
    let revokeError: unknown;
    try {
      await args.writeMetadata(latestNeutralClaims);
    } catch (error) {
      neutralError = error;
      report('conflict_neutral_metadata', error);
    }
    try {
      await args.revoke();
    } catch (error) {
      revokeError = error;
      report('conflict_revoke', error);
    }
    if (neutralError || revokeError) {
      throw new ApiError(
        'ROLE_METADATA_RESYNC_LOCK_FAILED',
        'Profile revalidation failed and fail-closed recovery failed; contact support immediately',
        502,
      );
    }
    throw new ApiError(
      operationalFailure ? 'ROLE_METADATA_REVALIDATION_FAILED' : 'ROLE_METADATA_STATE_CONFLICT',
      operationalFailure
        ? 'Could not revalidate the current profile; login remains disabled'
        : 'Profile changed during metadata resynchronization; login remains disabled',
      operationalFailure ? 502 : 409,
    );
  }

  async function revalidate(stage: 'pre_final_revalidation' | 'post_final_revalidation') {
    let snapshot: RoleMetadataSnapshot | null;
    try {
      snapshot = await args.readCurrentSnapshot();
    } catch (error) {
      report(stage, error);
      return failClosedAfterRevalidation(null, true);
    }
    if (!roleMetadataSnapshotMatches(snapshot, args.currentClaims, args.currentVersion)) {
      report(stage, new Error('Profile authorization snapshot changed'));
      return failClosedAfterRevalidation(snapshot, false);
    }
  }

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

  await revalidate('pre_final_revalidation');

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

  await revalidate('post_final_revalidation');

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
