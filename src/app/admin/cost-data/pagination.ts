export const COST_DATA_PAGE_SIZE = 50;

export function parseCostDataPage(
  rawPage: string | undefined,
  total: number,
): { page: number; pageSize: number; pageCount: number } {
  const requested = Number(rawPage);
  const pageCount = Math.max(1, Math.ceil(total / COST_DATA_PAGE_SIZE));
  const page = Number.isInteger(requested) && requested > 0 ? Math.min(requested, pageCount) : 1;
  return { page, pageSize: COST_DATA_PAGE_SIZE, pageCount };
}

export function costDataPageHref(params: Record<string, string | undefined>, page: number): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (key !== 'page' && value) query.set(key, value);
  }
  if (page > 1) query.set('page', String(page));
  const suffix = query.toString();
  return suffix ? `/admin/cost-data?${suffix}` : '/admin/cost-data';
}
