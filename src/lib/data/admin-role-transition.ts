import { ApiError } from '@/lib/errors';
import type { Role } from '@/lib/auth/roles';

export type RoleMetadataClaims = {
  mandoob_role: Role | null;
  tenant_id: string | null;
  mandoob_role_transition: 'pending' | null;
};

type DatabaseError = { message: string };
type FailureStage =
  | 'initial_revoke'
  | 'neutral_metadata'
  | 'neutral_revoke'
  | 'database_change'
  | 'restore_metadata'
  | 'final_metadata';

export class AtomicRoleChangeError extends Error {
  constructor(readonly databaseError: DatabaseError) {
    super('Atomic database role change failed');
  }
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
      'Role changed, but login remains disabled until auth metadata is synchronized; retry metadata synchronization',
      502,
    );
  }
}
