export type PublicReadState<T> =
  | { status: 'loading' }
  | { status: 'ready'; data: T }
  | { status: 'empty' }
  | { status: 'no-results'; query: string; activeFilters: string[] }
  | { status: 'unavailable' }
  | { status: 'missing' };

export const loadingState = (): PublicReadState<never> => ({ status: 'loading' });
export const readyState = <T>(data: T): PublicReadState<T> => ({ status: 'ready', data });
export const emptyState = (): PublicReadState<never> => ({ status: 'empty' });
export const noResultsState = (
  query: string,
  activeFilters: string[] = [],
): PublicReadState<never> => ({ status: 'no-results', query: query.trim(), activeFilters });
export const unavailableState = (): PublicReadState<never> => ({ status: 'unavailable' });
export const missingState = (): PublicReadState<never> => ({ status: 'missing' });

export async function resolvePublicRead<T>(
  load: () => Promise<T[]>,
): Promise<PublicReadState<T[]>> {
  try {
    const data = await load();
    return data.length === 0 ? emptyState() : readyState(data);
  } catch {
    return unavailableState();
  }
}
