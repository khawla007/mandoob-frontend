import Link from 'next/link';
import { Button } from '@/components/ui/button';

export type CompanyAppliedFiltersProps = {
  query: {
    q: string | null;
    status: string;
    tenantId: string | null;
  };
  labels: {
    heading: string;
    search: string;
    status: string;
    tenant: string;
    reset: string;
  };
};

export function CompanyAppliedFilters({ query, labels }: CompanyAppliedFiltersProps) {
  const filters = [
    query.q ? labels.search : null,
    query.status !== 'all' ? labels.status : null,
    query.tenantId ? labels.tenant : null,
  ].filter((label): label is string => Boolean(label));

  if (filters.length === 0) return null;

  return (
    <nav className="flex flex-wrap items-center gap-2" aria-label={labels.heading}>
      <span className="text-muted-foreground text-xs font-medium">{labels.heading}</span>
      {filters.map((label) => (
        <span key={label} className="bg-muted rounded-full px-3 py-1 text-xs">
          {label}
        </span>
      ))}
      <Button asChild variant="ghost" size="sm">
        <Link href="/admin/companies">{labels.reset}</Link>
      </Button>
    </nav>
  );
}
