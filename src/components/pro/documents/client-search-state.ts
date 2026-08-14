import type { DocumentCenterClientOption } from '@/lib/data/pro-document-center';

export type ClientSearchState = {
  text: string;
  selected: DocumentCenterClientOption | null;
  results: DocumentCenterClientOption[];
  open: boolean;
};

export type ClientSearchRequestGate = {
  generation: number;
  query: string;
};

export type ClientSearchRequest = ClientSearchRequestGate;

export function createClientSearchRequestGate(query: string): ClientSearchRequestGate {
  return { generation: 0, query };
}

export function invalidateClientSearchRequest(
  gate: ClientSearchRequestGate,
  query: string,
): ClientSearchRequestGate {
  return { generation: gate.generation + 1, query };
}

export function beginClientSearchRequest(
  gate: ClientSearchRequestGate,
  query: string,
): { gate: ClientSearchRequestGate; request: ClientSearchRequest } {
  const request = invalidateClientSearchRequest(gate, query);
  return { gate: request, request };
}

export function isCurrentClientSearchResponse(
  gate: ClientSearchRequestGate,
  request: ClientSearchRequest,
  outcome: 'success' | 'failure',
): boolean {
  void outcome;
  return gate.generation === request.generation && gate.query === request.query;
}

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
): ClientSearchState;
export function receiveClientSearchResults(
  state: ClientSearchState,
  requestText: string,
  results: DocumentCenterClientOption[],
): ClientSearchState;
export function receiveClientSearchResults(
  state: ClientSearchState,
  requestTextOrResults: string | DocumentCenterClientOption[],
  requestedResults?: DocumentCenterClientOption[],
): ClientSearchState {
  const requestText = typeof requestTextOrResults === 'string' ? requestTextOrResults : state.text;
  if (state.text !== requestText) return state;
  const results =
    typeof requestTextOrResults === 'string' ? (requestedResults ?? []) : requestTextOrResults;
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
