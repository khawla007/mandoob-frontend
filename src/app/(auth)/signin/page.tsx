import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { buildAuthMetadata } from '@/lib/public-metadata';

export { default } from '../login/page';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth.metadata.login');
  return buildAuthMetadata({
    title: t('title'),
    description: t('description'),
    canonical: '/login',
  });
}
