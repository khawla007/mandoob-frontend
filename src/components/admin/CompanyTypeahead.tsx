'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

export type CompanyLookupRow = {
  id: string;
  company_name: string;
  status: string;
};

export type CompanyTypeaheadProps = {
  tenantId: string | null;
  value: string | null;
  onChange: (id: string | null, row?: CompanyLookupRow) => void;
  accessibleLabel: string;
  required?: boolean;
  placeholder?: string;
};

export function CompanyTypeahead({
  tenantId,
  value,
  onChange,
  accessibleLabel,
  required,
  placeholder,
}: CompanyTypeaheadProps) {
  const t = useTranslations('admin');
  const resolvedPlaceholder = placeholder ?? t('companyTypeahead.searchPlaceholder');
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<CompanyLookupRow[]>([]);
  const [loading, setLoading] = useState(false);
  // Sticky cache of the last selected row's metadata so the trigger
  // label survives even when filtering changes the visible rows list.
  const [labelCache, setLabelCache] = useState<CompanyLookupRow | null>(null);
  const debounceRef = useRef<number | null>(null);

  useEffect(() => {
    // Don't bootstrap requests until the user actually opens the typeahead.
    // Saves a request per render of optional pickers (customer.linked_company_id).
    if (!tenantId || !open) return;
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    const controller = new AbortController();
    debounceRef.current = window.setTimeout(() => {
      const url = new URL('/api/v1/admin/companies', window.location.origin);
      url.searchParams.set('tenantId', tenantId);
      if (query) url.searchParams.set('q', query);
      setLoading(true);
      fetch(url.toString(), { signal: controller.signal })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.statusText))))
        .then((j: { rows: CompanyLookupRow[] }) => setRows(j.rows ?? []))
        .catch((err: unknown) => {
          if (err instanceof Error && err.name === 'AbortError') return;
          setRows([]);
        })
        .finally(() => setLoading(false));
    }, 250);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
      controller.abort();
    };
  }, [tenantId, query, open]);

  // Resolve the trigger label without setState-in-effect: prefer a row from
  // the live rows list, then the sticky cache (so it survives query changes).
  const selected = useMemo<CompanyLookupRow | null>(() => {
    if (!value) return null;
    const effectiveRows: CompanyLookupRow[] = tenantId ? rows : [];
    const match = effectiveRows.find((r) => r.id === value);
    if (match) return match;
    if (labelCache && labelCache.id === value) return labelCache;
    return null;
  }, [value, tenantId, rows, labelCache]);

  if (!tenantId) {
    return (
      <Button type="button" variant="outline" disabled className="w-full justify-start">
        {t('companyTypeahead.noTenant')}
      </Button>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          aria-required={required}
          className="w-full justify-between"
        >
          {selected ? selected.company_name : resolvedPlaceholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        aria-label={accessibleLabel}
        className="w-[--radix-popover-trigger-width] p-0"
        align="start"
      >
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={t('companyTypeahead.typeToSearch')}
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            {loading && (
              <div className="text-muted-foreground p-3 text-xs">
                {t('companyTypeahead.loading')}
              </div>
            )}
            {!loading && rows.length === 0 && (
              <CommandEmpty>{t('companyTypeahead.noMatches')}</CommandEmpty>
            )}
            <CommandGroup>
              {rows.map((row) => (
                <CommandItem
                  key={row.id}
                  value={row.id}
                  onSelect={() => {
                    setLabelCache(row);
                    onChange(row.id, row);
                    setOpen(false);
                  }}
                >
                  <span className="flex-1 truncate">{row.company_name}</span>
                  <span className="text-foreground/70 ml-2 text-xs">
                    {t.has(`enums.companyStatus.${row.status}`)
                      ? t(`enums.companyStatus.${row.status}`)
                      : row.status}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
