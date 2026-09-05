import Link from 'next/link';
import { Filter, Upload } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type {
  EmployeeRegistryResult,
  EmployeeRegistryRow,
  EmployeeRegistrySearch,
} from '@/lib/data/pro-employee-registry';
import { employeeRegistryDisplayState } from '@/lib/data/employee-registry-display';

type Labels = Record<string, string>;

export function EmployeeRegistryFilters({
  slug,
  search,
  labels,
}: {
  slug: string;
  search: EmployeeRegistrySearch;
  labels: Labels;
}) {
  return (
    <form
      className="border-border/60 grid gap-3 rounded-lg border p-4 md:grid-cols-[minmax(0,1fr)_repeat(4,minmax(9rem,auto))_auto]"
      method="get"
    >
      <label className="grid gap-1 text-sm" htmlFor="employee-search">
        <span>{labels.search}</span>
        <Input
          id="employee-search"
          name="q"
          defaultValue={search.q}
          maxLength={120}
          placeholder={labels.searchPlaceholder}
        />
      </label>
      <SelectFilter
        name="status"
        value={search.status}
        label={labels.status}
        options={['all', 'active', 'inactive', 'terminated']}
        labels={labels}
      />
      <SelectFilter
        name="visa"
        value={search.visa}
        label={labels.visaFilter}
        options={['any', 'recorded_expiry', 'missing_expiry']}
        labels={labels}
      />
      <SelectFilter
        name="eid"
        value={search.eid}
        label={labels.eidFilter}
        options={['any', 'recorded_expiry', 'missing_expiry']}
        labels={labels}
      />
      <SelectFilter
        name="risk"
        value={search.risk}
        label={labels.risk}
        options={['all', 'attention']}
        labels={labels}
      />
      {search.focus ? <input type="hidden" name="focus" value={search.focus} /> : null}
      <Button type="submit" className="min-h-11 self-end md:min-h-9">
        <Filter className="size-4" aria-hidden />
        {labels.apply}
      </Button>
      <Button asChild variant="outline" className="min-h-11 self-end md:min-h-9">
        <Link href={`/t/${encodeURIComponent(slug)}/employees`}>{labels.reset}</Link>
      </Button>
    </form>
  );
}

function SelectFilter({
  name,
  value,
  label,
  options,
  labels,
}: {
  name: string;
  value: string;
  label: string;
  options: string[];
  labels: Labels;
}) {
  return (
    <label className="grid gap-1 text-sm">
      <span>{label}</span>
      <select
        name={name}
        defaultValue={value}
        className="border-input bg-background h-10 rounded-md border px-3 text-sm"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {labels[option]}
          </option>
        ))}
      </select>
    </label>
  );
}

export function EmployeeRegistrySignals({
  result,
  labels,
  locale,
}: {
  result: EmployeeRegistryResult;
  labels: Labels;
  locale: string;
}) {
  const numberFormatter = new Intl.NumberFormat(locale);
  const values =
    result.state !== 'unavailable'
      ? [
          numberFormatter.format(result.total),
          numberFormatter.format(result.rows.length),
          numberFormatter.format(result.page),
        ]
      : [labels.unavailableValue, labels.unavailableValue, labels.unavailableValue];
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {[labels.total, labels.visible, labels.page].map((label, index) => (
        <section className="border-border/60 bg-card rounded-lg border p-4" key={label}>
          <p className="text-muted-foreground font-mono text-xs tracking-wide uppercase">{label}</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{values[index]}</p>
        </section>
      ))}
    </div>
  );
}

export function EmployeeRegistryTable({
  result,
  labels,
  locale,
}: {
  result: EmployeeRegistryResult;
  labels: Labels;
  locale: string;
}) {
  const displayState = employeeRegistryDisplayState(result);
  if (displayState === 'unavailable')
    return (
      <div className="rounded-lg border border-dashed p-8 text-center">
        <p className="font-medium">{labels.unavailable}</p>
        <p className="text-muted-foreground mt-1 text-sm">{labels.sanitizedError}</p>
      </div>
    );
  if (displayState === 'partial')
    return (
      <div className="rounded-lg border border-dashed p-8 text-center">
        <p className="font-medium">{labels.partial}</p>
        <p className="text-muted-foreground mt-1 text-sm">{labels.sanitizedError}</p>
      </div>
    );
  if (displayState === 'no_results')
    return (
      <div className="rounded-lg border border-dashed p-8 text-center">
        <p className="font-medium">{labels.emptyFiltered}</p>
        <p className="text-muted-foreground mt-1 text-sm">{labels.emptyFilteredGuidance}</p>
      </div>
    );
  if (displayState === 'empty')
    return (
      <div className="rounded-lg border border-dashed p-8 text-center">
        <p className="font-medium">{labels.empty}</p>
        <p className="text-muted-foreground mt-1 text-sm">{labels.emptyGuidance}</p>
      </div>
    );
  const formatDate = new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeZone: 'Asia/Dubai',
  });
  return (
    <div className="space-y-2">
      <p className="text-muted-foreground text-sm">{labels.identifierSurfaceUnavailable}</p>
      <p className="text-muted-foreground text-sm">{labels.phase3Note}</p>
      <div
        className="border-border/60 overflow-x-auto rounded-lg border"
        role="region"
        aria-label={labels.table}
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{labels.employee}</TableHead>
              <TableHead>{labels.status}</TableHead>
              <TableHead>{labels.visa}</TableHead>
              <TableHead>{labels.eid}</TableHead>
              <TableHead>{labels.tableRisk}</TableHead>
              <TableHead>{labels.provenance}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {result.rows.map((row) => (
              <EmployeeRow row={row} key={row.id} labels={labels} formatDate={formatDate} />
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

export function EmployeeRegistryPagination({
  slug,
  search,
  result,
  labels,
  locale,
}: {
  slug: string;
  search: EmployeeRegistrySearch;
  result: EmployeeRegistryResult;
  labels: Labels;
  locale: string;
}) {
  if (result.state === 'unavailable' || result.total <= result.pageSize) return null;
  const pageCount = Math.max(1, Math.ceil(result.total / result.pageSize));
  const numberFormatter = new Intl.NumberFormat(locale);
  const href = (page: number) => {
    const query = new URLSearchParams();
    if (search.q) query.set('q', search.q);
    if (search.status !== 'all') query.set('status', search.status);
    if (search.visa !== 'any') query.set('visa', search.visa);
    if (search.eid !== 'any') query.set('eid', search.eid);
    if (search.risk !== 'all') query.set('risk', search.risk);
    if (search.focus) query.set('focus', search.focus);
    query.set('page', String(page));
    return `/t/${encodeURIComponent(slug)}/employees?${query}`;
  };
  return (
    <nav className="flex items-center justify-between gap-3" aria-label={labels.pagination}>
      <p className="text-muted-foreground text-sm">
        {labels.pageCount
          .replace('{current}', numberFormatter.format(result.page))
          .replace('{total}', numberFormatter.format(pageCount))}
      </p>
      <div className="flex gap-2">
        <PaginationButton
          disabled={result.page <= 1}
          href={href(Math.max(1, result.page - 1))}
          label={labels.previous}
        />
        <PaginationButton
          disabled={result.page >= pageCount}
          href={href(Math.min(pageCount, result.page + 1))}
          label={labels.next}
        />
      </div>
    </nav>
  );
}

function PaginationButton({
  disabled,
  href,
  label,
}: {
  disabled: boolean;
  href: string;
  label: string;
}) {
  if (disabled)
    return (
      <Button disabled variant="outline">
        {label}
      </Button>
    );
  return (
    <Button asChild variant="outline">
      <Link href={href}>{label}</Link>
    </Button>
  );
}

function EmployeeRow({
  row,
  labels,
  formatDate,
}: {
  row: EmployeeRegistryRow;
  labels: Labels;
  formatDate: Intl.DateTimeFormat;
}) {
  return (
    <TableRow data-state={row.risk === 'attention' ? 'selected' : undefined}>
      <TableCell className="min-w-52">
        <p className="font-medium">{row.name}</p>
        <p className="text-muted-foreground max-w-64 truncate text-xs">
          {row.email ?? labels.notRecorded}
        </p>
        <p className="text-muted-foreground text-xs">{row.nationality ?? labels.notRecorded}</p>
      </TableCell>
      <TableCell>
        <Badge variant="secondary">{labels[row.status]}</Badge>
      </TableCell>
      <IdentityCell
        expiry={row.visaExpiry}
        state={row.visaState}
        identifierState={row.visaIdentifierState}
        labels={labels}
        formatDate={formatDate}
      />
      <IdentityCell
        expiry={row.eidExpiry}
        state={row.eidState}
        identifierState={row.eidIdentifierState}
        labels={labels}
        formatDate={formatDate}
      />
      <TableCell>
        <Badge variant={row.risk === 'attention' ? 'destructive' : 'secondary'}>
          {labels[row.risk]}
        </Badge>
      </TableCell>
      <TableCell className="text-muted-foreground text-sm">{labels.phase3Unavailable}</TableCell>
    </TableRow>
  );
}

function IdentityCell({
  expiry,
  state,
  identifierState,
  labels,
  formatDate,
}: {
  expiry: string | null;
  state: string;
  identifierState: string;
  labels: Labels;
  formatDate: Intl.DateTimeFormat;
}) {
  return (
    <TableCell className="min-w-36">
      <Badge variant={state === 'expired' ? 'destructive' : 'secondary'}>{labels[state]}</Badge>
      <p className="text-muted-foreground mt-1 text-xs whitespace-nowrap">
        {expiry ? formatDate.format(new Date(`${expiry}T00:00:00Z`)) : labels.expiryNotRecorded}
      </p>
      <p className="text-muted-foreground mt-1 text-xs">{labels[identifierState]}</p>
    </TableCell>
  );
}

export function EmployeeRegistryHeader({ slug, labels }: { slug: string; labels: Labels }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="text-primary font-mono text-xs tracking-[0.14em] uppercase">
          {labels.eyebrow}
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{labels.title}</h1>
        <p className="text-muted-foreground mt-1 max-w-3xl text-sm">{labels.description}</p>
      </div>
      <Button asChild className="min-h-11 sm:min-h-9">
        <Link href={`/t/${encodeURIComponent(slug)}/employees/import`}>
          <Upload className="size-4" aria-hidden />
          {labels.import}
        </Link>
      </Button>
    </header>
  );
}
