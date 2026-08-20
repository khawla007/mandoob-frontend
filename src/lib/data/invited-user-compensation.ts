import { ApiError } from '@/lib/errors';

type InvitedUserAdminClient = {
  auth: {
    admin: {
      deleteUser(userId: string): Promise<{ error: unknown | null }>;
    };
  };
};

type ErrorLogger = (message: string, details: Record<string, unknown>) => void;

function safeProviderCode(error: unknown): string {
  if (typeof error !== 'object' || error === null || !('code' in error)) return 'UNKNOWN';
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' && /^[a-z0-9_-]{1,64}$/iu.test(code) ? code : 'UNKNOWN';
}

export async function compensateInvitedUser(
  client: InvitedUserAdminClient,
  userId: string,
  reason: string,
  log: ErrorLogger = console.error,
): Promise<void> {
  let result: { error: unknown | null };
  try {
    result = await client.auth.admin.deleteUser(userId);
  } catch {
    log('admin-create-user compensation failed', {
      reason,
      userId,
      failure: 'provider_exception',
    });
    throw new ApiError('USER_CLEANUP_FAILED', 'Could not safely roll back user creation', 500);
  }

  if (result.error) {
    log('admin-create-user compensation failed', {
      reason,
      userId,
      failure: 'provider_error',
      providerCode: safeProviderCode(result.error),
    });
    throw new ApiError('USER_CLEANUP_FAILED', 'Could not safely roll back user creation', 500);
  }
}
