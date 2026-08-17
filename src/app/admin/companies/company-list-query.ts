import { z } from 'zod';
import type { CompanyStatus } from '@/lib/data/pro-firms';

const statuses = [
  'onboarding',
  'active',
  'renewal_due',
  'renewal_overdue',
  'suspended',
  'churned',
] as const;
const statusSchema = z.enum(statuses);
const uuidSchema = z.string().uuid();
const PAGE_SIZE = 25;

export type RawCompanyListQuery = Record<string, string | string[] | undefined>;
export type CompanyListQuery = {
  status: CompanyStatus | 'all';
  q: string | null;
  tenantId: string | null;
  page: number;
  pageSize: typeof PAGE_SIZE;
};

function single(value: string | string[] | undefined): string | null {
  return typeof value === 'string' ? value : null;
}

export function parseCompanyListQuery(raw: RawCompanyListQuery): CompanyListQuery {
  const statusValue = single(raw.status);
  const status = statusSchema.safeParse(statusValue);
  const qValue = single(raw.q)?.trim() ?? '';
  const tenantValue = single(raw.tenant);
  const tenant = uuidSchema.safeParse(tenantValue);
  const pageValue = single(raw.page);
  const parsedPage = pageValue && /^\d+$/u.test(pageValue) ? Number(pageValue) : 1;
  return {
    status: status.success ? status.data : 'all',
    q: qValue.length >= 1 && qValue.length <= 100 ? qValue : null,
    tenantId: tenant.success ? tenant.data : null,
    page:
      Number.isSafeInteger(parsedPage) && parsedPage >= 1 && parsedPage <= 10_000 ? parsedPage : 1,
    pageSize: PAGE_SIZE,
  };
}

export function companyListHref(query: CompanyListQuery, page: number): string {
  const params = new URLSearchParams();
  if (query.status !== 'all') params.set('status', query.status);
  if (query.q) params.set('q', query.q);
  if (query.tenantId) params.set('tenant', query.tenantId);
  if (page > 1) params.set('page', String(page));
  const suffix = params.toString();
  return suffix ? `/admin/companies?${suffix}` : '/admin/companies';
}

export function canonicalCompanyListHref(
  query: CompanyListQuery,
  totalPages: number,
): string | null {
  const lastPage = Math.max(1, totalPages);
  return query.page > lastPage ? companyListHref(query, lastPage) : null;
}
