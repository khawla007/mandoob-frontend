'use client';

import { useId, useState, useTransition } from 'react';
import { Search, X } from 'lucide-react';

import { searchDocumentClientsAction } from '@/app/(tenant)/t/[tenant]/(pro)/documents/actions';
import { Button } from '@/components/ui/button';
import type { DocumentCenterClientOption } from '@/lib/data/pro-document-center';
import {
  changeClientSearchText,
  clientSearchPropsRevision,
  clientSearchSubmissionValue,
  createClientSearchState,
  reconcileClientSearchProps,
  receiveClientSearchResults,
  selectClientSearchOption,
} from './client-search-state';

export type DocumentClientSearchLabels = {
  placeholder: string;
  search: string;
  searching: string;
  results: string;
  noResults: string;
  error: string;
  selectTemplate: string;
  clear: string;
};

function interpolate(template: string, values: Record<string, string>) {
  return Object.entries(values).reduce(
    (result, [key, value]) => result.replaceAll(`{${key}}`, value),
    template,
  );
}

type DocumentClientSearchFieldProps = {
  slug: string;
  name: 'client' | 'client_id';
  label: string;
  labels: DocumentClientSearchLabels;
  initialOptions: DocumentCenterClientOption[];
  selectedOption: DocumentCenterClientOption | null;
  required?: boolean;
};

export function DocumentClientSearchField(props: DocumentClientSearchFieldProps) {
  return (
    <DocumentClientSearchControl
      key={clientSearchPropsRevision(props.selectedOption, props.initialOptions)}
      {...props}
    />
  );
}

function DocumentClientSearchControl({
  slug,
  name,
  label,
  labels,
  initialOptions,
  selectedOption,
  required = false,
}: DocumentClientSearchFieldProps) {
  const inputId = useId();
  const listboxId = useId();
  const [state, setState] = useState(() =>
    reconcileClientSearchProps(createClientSearchState(null, []), selectedOption, initialOptions),
  );
  const [activeIndex, setActiveIndex] = useState(-1);
  const [error, setError] = useState(false);
  const [pending, startSearch] = useTransition();

  function select(option: DocumentCenterClientOption) {
    setState((current) => selectClientSearchOption(current, option));
    setActiveIndex(-1);
  }

  function search() {
    const requestText = state.text;
    setError(false);
    startSearch(async () => {
      try {
        const result = await searchDocumentClientsAction(slug, requestText);
        if (result.ok) {
          setState((current) => receiveClientSearchResults(current, requestText, result.data));
          setActiveIndex(result.data.length > 0 ? 0 : -1);
        } else {
          setError(true);
        }
      } catch {
        setError(true);
      }
    });
  }

  return (
    <div className="document-center__client-search grid min-w-0 gap-1.5 text-sm font-medium">
      <label htmlFor={inputId}>{label}</label>
      <div className="flex min-w-0 gap-2">
        <input
          id={inputId}
          type="search"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={state.open}
          aria-controls={listboxId}
          aria-activedescendant={
            state.open && activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined
          }
          aria-required={required}
          aria-invalid={required && state.text !== '' && !state.selected ? true : undefined}
          required={required}
          pattern={required && !state.selected ? '(?!)' : undefined}
          value={state.text}
          placeholder={labels.placeholder}
          onChange={(event) => {
            setState((current) => changeClientSearchText(current, event.target.value));
            setActiveIndex(-1);
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown' && state.results.length > 0) {
              event.preventDefault();
              setState((current) => ({ ...current, open: true }));
              setActiveIndex((current) => Math.min(current + 1, state.results.length - 1));
            } else if (event.key === 'ArrowUp' && state.results.length > 0) {
              event.preventDefault();
              setActiveIndex((current) => Math.max(current - 1, 0));
            } else if (event.key === 'Enter' && state.open && activeIndex >= 0) {
              event.preventDefault();
              const option = state.results[activeIndex];
              if (option) select(option);
            } else if (event.key === 'Escape') {
              setState((current) => ({ ...current, open: false }));
            }
          }}
          className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/40 h-9 min-w-0 flex-1 rounded-lg border px-3 text-sm outline-none focus-visible:ring-2"
        />
        <input type="hidden" name={name} value={clientSearchSubmissionValue(state)} />
        {state.text ? (
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label={labels.clear}
            onClick={() => setState(createClientSearchState(null, initialOptions))}
          >
            <X aria-hidden="true" />
          </Button>
        ) : null}
        <Button type="button" variant="outline" disabled={pending} onClick={search}>
          <Search aria-hidden="true" />
          {pending ? labels.searching : labels.search}
        </Button>
      </div>
      {state.open ? (
        <div
          id={listboxId}
          role="listbox"
          aria-label={labels.results}
          className="document-center__client-listbox bg-popover max-h-48 overflow-y-auto rounded-lg border p-1 shadow-sm"
        >
          {state.results.length > 0 ? (
            state.results.map((option, index) => (
              <button
                key={option.id}
                id={`${listboxId}-option-${index}`}
                type="button"
                role="option"
                aria-selected={state.selected?.id === option.id}
                aria-label={interpolate(labels.selectTemplate, { client: option.companyName })}
                onClick={() => select(option)}
                className="document-center__client-option hover:bg-muted focus-visible:bg-muted block w-full rounded-md px-3 py-2 text-start text-sm outline-none"
              >
                {option.companyName}
              </button>
            ))
          ) : (
            <p className="text-muted-foreground px-3 py-2 text-sm">{labels.noResults}</p>
          )}
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="text-destructive text-xs">
          {labels.error}
        </p>
      ) : null}
    </div>
  );
}
