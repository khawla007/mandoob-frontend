import type { CSSProperties } from 'react';

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export type TenantBrandingSource = {
  name: string;
  logo_url: string | null;
  favicon_url: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  terms_url?: string | null;
  privacy_url?: string | null;
};

export type TenantBrandingView = {
  name: string;
  logoUrl: string | null;
  faviconUrl: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
  termsUrl: string | null;
  privacyUrl: string | null;
  initial: string;
};

export function safeHexColor(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed && HEX_COLOR.test(trimmed) ? trimmed : null;
}

export function buildTenantBrandingView(source: TenantBrandingSource): TenantBrandingView {
  const name = source.name.trim() || 'Mandoob';
  return {
    name,
    logoUrl: source.logo_url,
    faviconUrl: source.favicon_url,
    primaryColor: safeHexColor(source.primary_color),
    secondaryColor: safeHexColor(source.secondary_color),
    termsUrl: source.terms_url ?? null,
    privacyUrl: source.privacy_url ?? null,
    initial: name.slice(0, 1).toUpperCase(),
  };
}

export function tenantBrandingStyle(input: {
  primaryColor: string | null;
  secondaryColor: string | null;
}): CSSProperties {
  const style: CSSProperties = {};
  if (input.primaryColor) {
    (style as CSSProperties & Record<string, string>)['--tenant-primary'] = input.primaryColor;
    (style as CSSProperties & Record<string, string>)['--primary'] = input.primaryColor;
    (style as CSSProperties & Record<string, string>)['--ring'] = input.primaryColor;
    (style as CSSProperties & Record<string, string>)['--sidebar-primary'] = input.primaryColor;
  }
  if (input.secondaryColor) {
    (style as CSSProperties & Record<string, string>)['--tenant-secondary'] = input.secondaryColor;
    (style as CSSProperties & Record<string, string>)['--secondary'] = input.secondaryColor;
  }
  return style;
}
