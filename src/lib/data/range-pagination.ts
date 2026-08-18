const DEFAULT_PAGE_SIZE = 1000;

type PageResult<T> = {
  data: T[] | null;
  error: { message?: string } | null;
};

export async function loadAllRangePages<T>(
  label: string,
  fetchPage: (from: number, to: number) => PromiseLike<PageResult<T>>,
  pageSize = DEFAULT_PAGE_SIZE,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const result = await fetchPage(from, from + pageSize - 1);
    if (result.error) {
      throw new Error(`Failed to load ${label}: ${result.error.message ?? 'unknown error'}`);
    }
    const page = result.data ?? [];
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}
