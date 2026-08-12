import { ApiError } from '@/lib/errors';
import type { Role } from '@/lib/auth/roles';
import type { ProfileStatus } from './admin-edit-helpers';

export type RoleMetadataClaims = {
  mandoob_role: Role | null;
  tenant_id: string | null;
  mandoob_status: ProfileStatus;
  mandoob_role_transition: 'pending' | null;
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
  | 'resync_disable';

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

export async function executeRoleChangeTransition(args: {
  oldClaims: RoleMetadataClaims;
  newClaims: RoleMetadataClaims;
  revoke(): Promise<void>;
  writeMetadata(claims: RoleMetadataClaims): Promise<void>;
  changeDatabase(): Promise<DatabaseError | null>;
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
  revoke(): Promise<void>;
  writeMetadata(claims: RoleMetadataClaims): Promise<void>;
  reportFailure?: (stage: FailureStage, error: unknown) => void;
}): Promise<void> {
  const report = args.reportFailure ?? (() => {});
  const neutralClaims: RoleMetadataClaims = {
    mandoob_role: null,
    tenant_id: null,
    mandoob_status: args.currentClaims.mandoob_status,
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
