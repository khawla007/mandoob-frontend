import type { Metadata } from 'next';

export const PUBLIC_SITE_ORIGIN = new URL('https://mandoob.ae');

type PublicMetadataInput = {
  title: string;
  description: string;
  canonical: string;
  referrer?: Metadata['referrer'];
};

function canonicalPath(value: string): string {
  return new URL(value, PUBLIC_SITE_ORIGIN).pathname;
}

export function buildPublicMetadata({
  title,
  description,
  canonical,
  referrer,
}: PublicMetadataInput): Metadata {
  const path = canonicalPath(canonical);
  return {
    title,
    description,
    alternates: { canonical: path },
    referrer,
    openGraph: { title, description, type: 'website', url: path },
  };
}

export function buildAuthMetadata(input: PublicMetadataInput): Metadata {
  return {
    ...buildPublicMetadata(input),
    openGraph: undefined,
    robots: { index: false, follow: false },
  };
}

export function buildUnavailableMetadata(input: PublicMetadataInput): Metadata {
  return {
    ...buildPublicMetadata(input),
    openGraph: undefined,
    robots: { index: false, follow: false },
  };
}
