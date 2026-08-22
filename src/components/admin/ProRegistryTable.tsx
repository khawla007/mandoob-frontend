import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';

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
                    className="inline-flex items-center gap-1 hover:underline"
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
                <Badge variant="outline">
                  {row.credentialState ? t(`credential.${row.credentialState}`) : t('notAvailable')}
                </Badge>
              </TableCell>
              <TableCell className="font-mono text-xs">
                {row.credentialExpiry ?? t('notAvailable')}
              </TableCell>
              <TableCell className="font-mono text-xs">{row.createdAt.slice(0, 10)}</TableCell>
              <TableCell>
                <Badge variant="secondary">{t(`account.${row.accountStatus}`)}</Badge>
              </TableCell>
              <TableCell>
                {row.eligible ? t('eligible.eligible') : t('eligible.ineligible')}
              </TableCell>
              <TableCell>{row.companyName ?? t('unassigned')}</TableCell>
              <TableCell>
                <Link
                  className="text-primary underline-offset-2 hover:underline"
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
