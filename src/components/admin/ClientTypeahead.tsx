'use client';

import { useEffect, useRef, useState } from 'react';
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

export type ClientLookupRow = {
  id: string;
  company_name: string;
  status: string;
};

export type ClientTypeaheadProps = {
  tenantId: string | null;
  value: string | null;
  onChange: (id: string | null, row?: ClientLookupRow) => void;
  required?: boolean;
  placeholder?: string;
};

export function ClientTypeahead({
  tenantId,
  value,
  onChange,
  required,
  placeholder = 'Search clients…',
}: ClientTypeaheadProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<ClientLookupRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<ClientLookupRow | null>(null);
  const debounceRef = useRef<number | null>(null);

  useEffect(() => {
    if (!tenantId) {
      setRows([]);
      return;
    }
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      const url = new URL('/api/v1/admin/clients', window.location.origin);
      url.searchParams.set('tenantId', tenantId);
      if (query) url.searchParams.set('q', query);
      setLoading(true);
      fetch(url.toString())
        .then((r) => (r.ok ? r.json() : Promise.reject(r.statusText)))
        .then((j: { rows: ClientLookupRow[] }) => setRows(j.rows ?? []))
        .catch(() => setRows([]))
        .finally(() => setLoading(false));
    }, 250);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [tenantId, query]);

  // Hydrate selected row label when value comes from outside (form reset)
  useEffect(() => {
    if (!value) {
      setSelected(null);
      return;
    }
    const match = rows.find((r) => r.id === value);
    if (match) setSelected(match);
  }, [value, rows]);

  if (!tenantId) {
    return (
      <Button type="button" variant="outline" disabled className="w-full justify-start">
        Select a tenant first
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
          {selected ? selected.company_name : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Type to search…" value={query} onValueChange={setQuery} />
          <CommandList>
            {loading && <div className="text-muted-foreground p-3 text-xs">Loading…</div>}
            {!loading && rows.length === 0 && <CommandEmpty>No matches.</CommandEmpty>}
            <CommandGroup>
              {rows.map((row) => (
                <CommandItem
                  key={row.id}
                  value={row.id}
                  onSelect={() => {
                    setSelected(row);
                    onChange(row.id, row);
                    setOpen(false);
                  }}
                >
                  <span className="flex-1 truncate">{row.company_name}</span>
                  <span className="text-muted-foreground ml-2 text-xs">{row.status}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
