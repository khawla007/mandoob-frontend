import type { DocumentCenterClientOption } from '@/lib/data/pro-document-center';

export type ClientSearchState = {
  text: string;
  selected: DocumentCenterClientOption | null;
  results: DocumentCenterClientOption[];
  open: boolean;
};

export function createClientSearchState(
  selected: DocumentCenterClientOption | null,
  initialResults: DocumentCenterClientOption[],
): ClientSearchState {
  return {
    text: selected?.companyName ?? '',
    selected,
    results: initialResults.slice(0, 50),
    open: false,
  };
}

export function reconcileClientSearchProps(
  _state: ClientSearchState,
  selected: DocumentCenterClientOption | null,
  initialResults: DocumentCenterClientOption[],
): ClientSearchState {
  return createClientSearchState(selected, initialResults);
}

export function clientSearchPropsRevision(
  selected: DocumentCenterClientOption | null,
  initialResults: DocumentCenterClientOption[],
): string {
  return [
    selected?.id ?? '',
    selected?.companyName ?? '',
    ...initialResults.flatMap((option) => [option.id, option.companyName]),
  ].join('\u0000');
}

export function changeClientSearchText(state: ClientSearchState, text: string): ClientSearchState {
  return {
    ...state,
    text,
    selected: text === state.selected?.companyName ? state.selected : null,
    open: false,
  };
}

export function receiveClientSearchResults(
  state: ClientSearchState,
  results: DocumentCenterClientOption[],
): ClientSearchState {
  return { ...state, results: results.slice(0, 50), open: true };
}

export function selectClientSearchOption(
  state: ClientSearchState,
  selected: DocumentCenterClientOption,
): ClientSearchState {
  return { ...state, text: selected.companyName, selected, open: false };
}

export function clientSearchSubmissionValue(state: ClientSearchState): string {
  return state.selected?.id ?? '';
}
