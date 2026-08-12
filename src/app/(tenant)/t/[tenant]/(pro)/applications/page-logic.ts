import { serviceCaseFilterSchema } from '@/lib/validation/service-case';

export type ApplicationSearchParams = {
  status?: string | string[];
  owner?: string | string[];
  page?: string | string[];
};

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function parseApplicationPage(value: string | string[] | undefined): number {
  const parsed = Number.parseInt(first(value) ?? '1', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

export function applicationPageHref(
  slug: string,
  filters: { status?: string[]; assigned_to?: string },
  page: number,
): string {
  const params = new URLSearchParams();
  if (filters.status?.length) params.set('status', filters.status.join(','));
  if (filters.assigned_to) params.set('owner', filters.assigned_to);
  params.set('page', String(page));
  return `/t/${slug}/applications?${params.toString()}`;
}

export function parseApplicationFilters(search: ApplicationSearchParams) {
  const status = first(search.status)?.split(',').filter(Boolean);
  const parsed = serviceCaseFilterSchema.safeParse({
    status: status?.length ? status : undefined,
    assigned_to: first(search.owner) || undefined,
  });
  return parsed.success ? parsed.data : {};
}
