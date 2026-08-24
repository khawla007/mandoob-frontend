'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type Row = {
  proProfileId: string;
  fullName: string | null;
  eligibility: { eligible: boolean; codes: string[] };
};

export function ProAssignmentTypeahead({
  companyId,
  label,
  name,
  error,
  errorId,
}: {
  companyId: string;
  label: string;
  name: string;
  error?: string;
  errorId?: string;
}) {
  const t = useTranslations('admin.companies');
  const listId = useId();
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [active, setActive] = useState(-1);
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const debounceRef = useRef<number | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    const requestId = ++requestIdRef.current;
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    if (selectedId) return;
    if (query.trim().length < 2) return;
    const controller = new AbortController();
    debounceRef.current = window.setTimeout(() => {
      setState('loading');
      fetch(
        `/api/v1/admin/companies/${encodeURIComponent(companyId)}/eligible-pros?q=${encodeURIComponent(query.trim())}&limit=20`,
        { signal: controller.signal },
      )
        .then((response) => (response.ok ? response.json() : Promise.reject(new Error('lookup'))))
        .then((payload: { rows?: Row[] }) => {
          if (requestId !== requestIdRef.current) return;
          setRows(payload.rows ?? []);
          setActive(-1);
          setState('ready');
        })
        .catch((error: unknown) => {
          if (error instanceof Error && error.name === 'AbortError') return;
          if (requestId !== requestIdRef.current) return;
          setRows([]);
          setState('error');
        });
    }, 250);
    return () => {
      controller.abort();
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [companyId, query, selectedId]);

  const move = (delta: number) => {
    const eligible = rows
      .map((row, index) => (row.eligibility.eligible ? index : -1))
      .filter((index) => index >= 0);
    if (eligible.length === 0) return;
    const position = eligible.indexOf(active);
    setActive(eligible[(position + delta + eligible.length) % eligible.length]!);
  };
  const select = (row: Row) => {
    if (!row.eligibility.eligible) return;
    setSelectedId(row.proProfileId);
    setQuery(row.fullName ?? t('assignment.unnamedPro'));
    setRows([]);
    setActive(-1);
    setState('idle');
  };

  return (
    <div className="relative grid gap-2">
      <Label htmlFor={`${listId}-input`}>{label}</Label>
      <input type="hidden" name={name} value={selectedId} />
      <Input
        id={`${listId}-input`}
        value={query}
        autoComplete="off"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={rows.length > 0}
        aria-controls={listId}
        aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
        aria-describedby={`${listId}-status${error && errorId ? ` ${errorId}` : ''}`}
        aria-invalid={error ? true : undefined}
        required
        onChange={(event) => {
          const value = event.target.value;
          setQuery(value);
          setSelectedId('');
          setRows([]);
          setActive(-1);
          if (value.trim().length < 2) setState('idle');
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            move(1);
          }
          if (event.key === 'ArrowUp') {
            event.preventDefault();
            move(-1);
          }
          if (event.key === 'Enter' && active >= 0) {
            event.preventDefault();
            select(rows[active]!);
          }
          if (event.key === 'Escape') {
            setRows([]);
            setActive(-1);
          }
        }}
      />
      <p id={`${listId}-status`} className="text-muted-foreground text-sm" aria-live="polite">
        {state === 'idle'
          ? t('typeahead.prompt')
          : state === 'loading'
            ? t('typeahead.loading')
            : state === 'error'
              ? t('typeahead.error')
              : rows.length === 0
                ? t('typeahead.empty')
                : t('typeahead.results', { count: rows.length })}
      </p>
      {error && errorId ? (
        <p id={errorId} className="text-destructive text-sm">
          {error}
        </p>
      ) : null}
      {rows.length > 0 ? (
        <ul
          id={listId}
          role="listbox"
          className="bg-popover border-border absolute inset-x-0 top-full z-20 max-h-64 overflow-y-auto rounded-md border shadow-md"
        >
          {rows.map((row, index) => (
            <li
              id={`${listId}-${index}`}
              key={row.proProfileId}
              role="option"
              aria-selected={index === active}
              aria-disabled={!row.eligibility.eligible}
              className="data-[active=true]:bg-accent px-3 py-2 text-sm"
              data-active={index === active}
              onMouseDown={(event) => {
                event.preventDefault();
                select(row);
              }}
            >
              <span className="font-medium">{row.fullName ?? t('assignment.unnamedPro')}</span>
              {!row.eligibility.eligible ? (
                <span className="text-muted-foreground block">
                  {row.eligibility.codes.map((code) => t(`eligibility.${code}`)).join('; ')}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
