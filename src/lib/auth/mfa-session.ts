type SessionTokens = { access_token: string; refresh_token: string };
type AuthSessionWriter = {
  setSession(tokens: SessionTokens): Promise<{ error: unknown }>;
};

export async function persistVerifiedMfaSession(
  auth: AuthSessionWriter,
  tokens: SessionTokens,
): Promise<boolean> {
  const { error } = await auth.setSession({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
  });
  return error === null;
}
