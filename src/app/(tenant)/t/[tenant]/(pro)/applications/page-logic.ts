import { serviceCaseFilterSchema } from '@/lib/validation/service-case';

export type ApplicationSearchParams = {
  status?: string | string[];
  owner?: string | string[];
};

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function parseApplicationFilters(search: ApplicationSearchParams) {
  const status = first(search.status)?.split(',').filter(Boolean);
  const parsed = serviceCaseFilterSchema.safeParse({
    status: status?.length ? status : undefined,
    assigned_to: first(search.owner) || undefined,
  });
  return parsed.success ? parsed.data : {};
}
