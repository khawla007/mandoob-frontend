import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { env } from '@/lib/env';
import { ApiError } from '@/lib/errors';

type ReauthenticationResult = {
  userId: string | null;
  hasSession: boolean;
  error: unknown;
};

export type ReauthenticationClient = {
  signIn(email: string, password: string): Promise<ReauthenticationResult>;
  signOutLocal(): Promise<{ error: unknown }>;
};

export async function verifyCurrentPasswordWith(
  client: ReauthenticationClient,
  expectedUserId: string,
  email: string,
  password: string,
): Promise<boolean> {
  const result = await client.signIn(email, password);
  if (!result.hasSession) return false;

  try {
    return !result.error && result.userId === expectedUserId;
  } finally {
    const cleanup = await client.signOutLocal();
    if (cleanup.error) {
      throw new ApiError('INTERNAL', 'Could not complete password verification', 500);
    }
  }
}

export async function verifyCurrentPassword(
  expectedUserId: string,
  email: string,
  password: string,
): Promise<boolean> {
  const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  return verifyCurrentPasswordWith(
    {
      signIn: async (candidateEmail, candidatePassword) => {
        const { data, error } = await client.auth.signInWithPassword({
          email: candidateEmail,
          password: candidatePassword,
        });
        return {
          userId: data.user?.id ?? null,
          hasSession: data.session !== null,
          error,
        };
      },
      signOutLocal: async () => client.auth.signOut({ scope: 'local' }),
    },
    expectedUserId,
    email,
    password,
  );
}
