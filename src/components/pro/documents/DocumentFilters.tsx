import Link from 'next/link';
import { Filter, Search } from 'lucide-react';

import type { DocumentCenterClientOption } from '@/lib/data/pro-document-center';
import type { DocumentCenterSearch } from '@/lib/validation/pro-document-center';
import { DOC_TYPES, type DocType } from '@/lib/validation/document';

export type DocumentFilterLabels = {
  search: string;
  searchPlaceholder: string;
  view: string;
  client: string;
  type: string;
  window: string;
  from: string;
  to: string;
  sort: string;
  all: string;
  moreFilters: string;
  apply: string;
  reset: string;
  appliedFilters: string;
  views: Record<DocumentCenterSearch['view'], string>;
  windows: Record<DocumentCenterSearch['window'], string>;
  sorts: Record<DocumentCenterSearch['sort'], string>;
  docTypes: Record<DocType, string>;
};

const fieldClass =
  'border-input bg-background focus-visible:border-ring focus-visible:ring-ring/40 h-9 min-w-0 rounded-lg border px-3 text-sm outline-none focus-visible:ring-2';

export function DocumentFilters({
  query,
  clients,
  labels,
  resetHref,
  locale,
}: {
  query: DocumentCenterSearch;
  clients: DocumentCenterClientOption[];
  labels: DocumentFilterLabels;
  resetHref: string;
  locale: string;
}) {
  const dateFormatter = new Intl.DateTimeFormat(locale, {
    timeZone: 'Asia/Dubai',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
  const formatIsoDate = (value: string) => dateFormatter.format(new Date(`${value}T12:00:00.000Z`));
  const applied = [
    query.search ? `${labels.search}: ${query.search}` : null,
    query.view !== 'all' ? labels.views[query.view] : null,
    query.clientId
      ? `${labels.client}: ${clients.find((client) => client.id === query.clientId)?.companyName ?? query.clientId}`
      : null,
    query.docType ? labels.docTypes[query.docType] : null,
    query.window !== 'all' ? labels.windows[query.window] : null,
    query.from ? `${labels.from}: ${formatIsoDate(query.from)}` : null,
    query.to ? `${labels.to}: ${formatIsoDate(query.to)}` : null,
    query.sort !== 'urgency' ? labels.sorts[query.sort] : null,
  ].filter((value): value is string => Boolean(value));

  return (
    <form method="get" className="document-center__filters grid min-w-0 gap-3">
      <div className="grid min-w-0 gap-3 md:grid-cols-[minmax(14rem,1fr)_minmax(10rem,0.5fr)_auto]">
        <label className="grid min-w-0 gap-1.5 text-sm font-medium">
          {labels.search}
          <span className="relative min-w-0">
            <Search
              aria-hidden="true"
              className="text-muted-foreground inset-block-1/2 inset-inline-start-3 pointer-events-none absolute size-4 -translate-y-1/2"
            />
            <input
              name="q"
              type="search"
              defaultValue={query.search ?? ''}
              placeholder={labels.searchPlaceholder}
              className={`${fieldClass} w-full ps-9`}
            />
          </span>
        </label>
        <label className="grid min-w-0 gap-1.5 text-sm font-medium">
          {labels.view}
          <select name="view" defaultValue={query.view} className={`${fieldClass} w-full`}>
            {Object.entries(labels.views).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-end">
          <button
            type="submit"
            className="bg-primary text-primary-foreground focus-visible:ring-ring hover:bg-primary/90 inline-flex h-9 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
          >
            <Filter aria-hidden="true" className="size-4" />
            {labels.apply}
          </button>
        </div>
      </div>

      <details open className="document-center__filter-disclosure group min-w-0">
        <summary className="focus-visible:ring-ring flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-lg text-sm font-medium outline-none focus-visible:ring-2 md:hidden">
          <Filter aria-hidden="true" className="size-4" />
          {labels.moreFilters}
        </summary>
        <div className="grid min-w-0 gap-3 pt-3 sm:grid-cols-2 md:grid-cols-4 xl:grid-cols-7">
          <label className="grid min-w-0 gap-1.5 text-sm font-medium">
            {labels.client}
            <select name="client" defaultValue={query.clientId ?? ''} className={fieldClass}>
              <option value="">{labels.all}</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.companyName}
                </option>
              ))}
            </select>
          </label>
          <label className="grid min-w-0 gap-1.5 text-sm font-medium">
            {labels.type}
            <select name="type" defaultValue={query.docType ?? ''} className={fieldClass}>
              <option value="">{labels.all}</option>
              {DOC_TYPES.map((type) => (
                <option key={type} value={type}>
                  {labels.docTypes[type]}
                </option>
              ))}
            </select>
          </label>
          <label className="grid min-w-0 gap-1.5 text-sm font-medium">
            {labels.window}
            <select name="window" defaultValue={query.window} className={fieldClass}>
              {Object.entries(labels.windows).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="grid min-w-0 gap-1.5 text-sm font-medium">
            {labels.from}
            <input name="from" type="date" defaultValue={query.from ?? ''} className={fieldClass} />
          </label>
          <label className="grid min-w-0 gap-1.5 text-sm font-medium">
            {labels.to}
            <input name="to" type="date" defaultValue={query.to ?? ''} className={fieldClass} />
          </label>
          <label className="grid min-w-0 gap-1.5 text-sm font-medium sm:col-span-2 md:col-span-1 xl:col-span-2">
            {labels.sort}
            <select name="sort" defaultValue={query.sort} className={fieldClass}>
              {Object.entries(labels.sorts).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </details>

      {applied.length > 0 ? (
        <div
          className="flex min-w-0 flex-wrap items-center gap-2"
          aria-label={labels.appliedFilters}
        >
          <span className="text-muted-foreground text-xs font-medium">{labels.appliedFilters}</span>
          {applied.map((value) => (
            <span key={value} className="bg-muted rounded-full px-2.5 py-1 text-xs">
              {value}
            </span>
          ))}
          <Link
            href={resetHref}
            className="text-primary focus-visible:ring-ring rounded px-2 py-1 text-xs font-medium outline-none hover:underline focus-visible:ring-2"
          >
            {labels.reset}
          </Link>
        </div>
      ) : null}
    </form>
  );
}
