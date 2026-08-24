import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import type { ProRegistryFilters } from '@/app/admin/users/pro-registry-params';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export async function ProRegistryToolbar({ filters }: { filters: ProRegistryFilters }) {
  const t = await getTranslations('admin.user.proRegistry');
  const selects = [
    ['accountStatus', ['active', 'invited', 'inactive']],
    [
      'credentialState',
      ['draft', 'submitted', 'under_review', 'verified', 'rejected', 'expired', 'revoked'],
    ],
    ['eligibility', ['eligible', 'ineligible']],
    ['assignment', ['assigned', 'unassigned']],
    ['expiryWindow', ['expired', '30_days', '60_days', '90_days']],
  ] as const;
  return (
    <form action="/admin/users" method="get" className="grid gap-3 lg:grid-cols-6">
      <input type="hidden" name="role" value="pro" />
      <div className="lg:col-span-2">
        <Label htmlFor="pro-registry-q">{t('searchLabel')}</Label>
        <Input
          id="pro-registry-q"
          name="q"
          defaultValue={filters.q ?? ''}
          maxLength={160}
          placeholder={t('searchPlaceholder')}
          className="mt-1"
        />
      </div>
      {selects.map(([name, values]) => (
        <div key={name}>
          <Label htmlFor={`pro-registry-${name}`}>{t(`filters.${name}`)}</Label>
          <select
            id={`pro-registry-${name}`}
            name={name}
            defaultValue={filters[name] ?? ''}
            className="border-input bg-background mt-1 min-h-11 w-full rounded-md border px-3 text-sm focus-visible:ring-2"
          >
            <option value="">{t('filters.all')}</option>
            {values.map((value) => (
              <option key={value} value={value}>
                {t(`${name}.${value}`)}
              </option>
            ))}
          </select>
        </div>
      ))}
      <div className="flex items-end gap-2 lg:col-span-6">
        <Button type="submit" className="min-h-11">
          {t('apply')}
        </Button>
        <Button asChild type="button" variant="ghost" className="min-h-11">
          <Link href="/admin/users?role=pro">{t('reset')}</Link>
        </Button>
      </div>
    </form>
  );
}
