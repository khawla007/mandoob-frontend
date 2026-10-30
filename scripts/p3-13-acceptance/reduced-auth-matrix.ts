type ReducedRole = 'admin' | 'pro' | 'customer' | 'employee';
type ReducedState = 'inactive' | 'aal1' | 'aal2';

export type ReducedAuthorizationEntry = {
  role: ReducedRole;
  authoritativeRole: 'super_admin' | 'pro' | 'customer' | 'employee';
  home: string;
  loginPath: string;
  aal1Destination: 'challenge' | 'home';
  states: readonly ReducedState[];
  wrongCompanyPath: string | null;
};

export function buildReducedLoginPath(home: string): string {
  return `/login?next=${encodeURIComponent(home)}`;
}

export function buildReducedMfaPath(home: string): string {
  return `/mfa/challenge?next=${encodeURIComponent(home)}`;
}

export function buildReducedAuthorizationMatrix(tenantSlug: string): ReducedAuthorizationEntry[] {
  const scoped = `/t/${encodeURIComponent(tenantSlug)}`;
  const wrong = '/t/p3-13-wrong-company';
  const states = ['inactive', 'aal1', 'aal2'] as const;
  return [
    {
      role: 'admin',
      authoritativeRole: 'super_admin',
      home: '/admin',
      loginPath: '/mfa/challenge',
      aal1Destination: 'challenge',
      states,
      wrongCompanyPath: null,
    },
    {
      role: 'pro',
      authoritativeRole: 'pro',
      home: `${scoped}/dashboard`,
      loginPath: '/mfa/challenge',
      aal1Destination: 'challenge',
      states,
      wrongCompanyPath: `${wrong}/dashboard`,
    },
    {
      role: 'customer',
      authoritativeRole: 'customer',
      home: `${scoped}/portal`,
      loginPath: `${scoped}/portal`,
      aal1Destination: 'home',
      states,
      wrongCompanyPath: `${wrong}/portal`,
    },
    {
      role: 'employee',
      authoritativeRole: 'employee',
      home: `${scoped}/employee/dashboard`,
      loginPath: `${scoped}/employee/dashboard`,
      aal1Destination: 'home',
      states,
      wrongCompanyPath: `${wrong}/employee/dashboard`,
    },
  ];
}
