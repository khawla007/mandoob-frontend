import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import {
  buildProRegistryHref,
  type ProRegistryFilters,
} from '@/app/admin/users/pro-registry-params';
import { Badge } from '@/components/ui/badge';

export async function ProRegistryAppliedFilters({ filters }: { filters: ProRegistryFilters }) {
  const t = await getTranslations('admin.user.proRegistry');
  const active = [
    ['q', filters.q],
    ['accountStatus', filters.accountStatus],
    ['credentialState', filters.credentialState],
    ['eligibility', filters.eligibility],
    ['assignment', filters.assignment],
    ['expiryWindow', filters.expiryWindow],
  ] as const;
  const present = active.filter((entry): entry is typeof entry & [(typeof entry)[0], string] =>
    Boolean(entry[1]),
  );
  if (present.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2" aria-label={t('appliedFilters')}>
      <span className="text-muted-foreground text-xs">{t('appliedFilters')}</span>
      {present.map(([key, value]) => (
        <Badge key={key} asChild variant="secondary">
          <Link href={buildProRegistryHref(filters, { [key]: undefined })}>
            {t(`filters.${key}`)}: {key === 'q' ? value : t(`${key}.${value}`)} ×
          </Link>
        </Badge>
      ))}
    </div>
  );
}
