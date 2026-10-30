type AcceptanceOriginEnvironment = Record<string, string | undefined>;

export function isExplicitLocalAcceptanceOrigin(env: AcceptanceOriginEnvironment): boolean {
  const configured = env.NEXT_PUBLIC_APP_URL;
  return (
    (env.P112_ACCEPTANCE_LOCAL_ONLY === '1' && configured === 'http://127.0.0.1:3001') ||
    (env.P2_ACCEPTANCE_LOCAL_ONLY === '1' && configured === 'http://127.0.0.1:3100') ||
    (env.P3_13_ACCEPTANCE_LOCAL_ONLY === '1' && configured === 'http://127.0.0.1:3113')
  );
}
