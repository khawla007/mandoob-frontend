export type DashboardTarget = 'applications' | 'renewals' | 'documents' | 'payments';

export function dashboardHref(
  slug: string,
  target: DashboardTarget,
  params: Record<string, string>,
): string {
  const query = new URLSearchParams(params);
  return `/t/${encodeURIComponent(slug)}/${target}?${query.toString()}`;
}
