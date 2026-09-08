export type AuthExperienceVariant = 'login' | 'register' | 'sensitive';

const sensitivePaths = ['/forgot-password', '/reset-password', '/verify-otp', '/invite', '/mfa'];

export function variantForPath(pathname: string): AuthExperienceVariant {
  if (sensitivePaths.some((path) => pathname === path || pathname.startsWith(`${path}/`))) {
    return 'sensitive';
  }
  return pathname === '/register' || pathname.startsWith('/register/') ? 'register' : 'login';
}
