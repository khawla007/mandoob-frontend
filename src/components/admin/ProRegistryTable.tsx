import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import {
  ArrowDown,
  ArrowUp,
  Building2,
  ChevronsUpDown,
  CircleCheck,
  CircleX,
  UserRoundCheck,
} from 'lucide-react';

import {
  buildProRegistryHref,
  type ProRegistryFilters,
} from '@/app/admin/users/pro-registry-params';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { ProRegistryRow } from '@/lib/data/pro-registry';
import { formatProRegistryDate } from './pro-registry-format';
import { ProCredentialStatusBadge } from './ProLifecycleStatusBadge';

const sortable = [
  ['full_name', 'name'],
  ['state', 'credential'],
  ['credential_expiry', 'expiry'],
  ['created_at', 'created'],
] as const;

export async function ProRegistryTable({
  rows,
  filters,
}: {
  rows: ProRegistryRow[];
  filters: ProRegistryFilters;
}) {
  const t = await getTranslations('admin.user.proRegistry');
  const locale = await getLocale();
  return (
    <div
      role="region"
      aria-label={t('tableScrollLabel')}
      tabIndex={0}
      className="border-border/60 overflow-x-auto rounded-lg border"
    >
      <Table className="min-w-[64rem]">
        <TableHeader>
          <TableRow>
            {sortable.map(([sort, label]) => {
              const active = filters.sort === sort;
              const direction = active && filters.direction === 'asc' ? 'desc' : 'asc';
              const Icon = !active
                ? ChevronsUpDown
                : filters.direction === 'asc'
                  ? ArrowUp
                  : ArrowDown;
              return (
                <TableHead
                  key={sort}
                  aria-sort={
                    active ? (filters.direction === 'asc' ? 'ascending' : 'descending') : 'none'
                  }
                >
                  <Link
                    className="focus-visible:ring-ring inline-flex min-h-11 items-center gap-1 rounded-md hover:underline focus-visible:ring-2 focus-visible:outline-none"
                    href={buildProRegistryHref(filters, { sort, direction })}
                  >
                    {t(`table.${label}`)} <Icon aria-hidden className="size-3" />
                  </Link>
                </TableHead>
              );
            })}
            <TableHead>{t('table.account')}</TableHead>
            <TableHead>{t('table.eligibility')}</TableHead>
            <TableHead>{t('table.assignment')}</TableHead>
            <TableHead>{t('table.action')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell>
                <div className="font-medium">{row.fullName ?? t('unnamed')}</div>
                <div className="text-muted-foreground text-xs">
                  {row.emailUnavailable ? t('emailUnavailable') : row.email}
                </div>
              </TableCell>
              <TableCell>
                {row.credentialState ? (
                  <ProCredentialStatusBadge
                    state={row.credentialState}
                    label={t(`credential.${row.credentialState}`)}
                  />
                ) : (
                  <Badge variant="outline">
                    <CircleX aria-hidden />
                    {t('notAvailable')}
                  </Badge>
                )}
              </TableCell>
              <TableCell className="font-mono text-xs">
                {row.credentialExpiry
                  ? formatProRegistryDate(row.credentialExpiry, locale)
                  : t('notAvailable')}
              </TableCell>
              <TableCell className="font-mono text-xs">
                {formatProRegistryDate(row.createdAt, locale)}
              </TableCell>
              <TableCell>
                <Badge variant="secondary">
                  <UserRoundCheck aria-hidden />
                  {t(`account.${row.accountStatus}`)}
                </Badge>
              </TableCell>
              <TableCell>
                <span className="inline-flex items-center gap-1">
                  {row.eligible ? (
                    <CircleCheck aria-hidden className="size-4" />
                  ) : (
                    <CircleX aria-hidden className="size-4" />
                  )}
                  {row.eligible ? t('eligible.eligible') : t('eligible.ineligible')}
                </span>
              </TableCell>
              <TableCell>
                <span className="inline-flex items-center gap-1">
                  <Building2 aria-hidden className="size-4" />
                  {row.companyName ?? t('unassigned')}
                </span>
              </TableCell>
              <TableCell>
                <Link
                  className="text-primary focus-visible:ring-ring inline-flex min-h-11 items-center rounded-md underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:outline-none"
                  href={`/admin/users/${row.id}`}
                >
                  {t('open')}
                </Link>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
