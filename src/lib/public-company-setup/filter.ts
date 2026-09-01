import type { FreeZoneDirectoryItem, SetupDirectoryFilters } from './contracts';

export const EMPTY_FILTERS: SetupDirectoryFilters = {
  query: '',
  emirate: 'all',
  businessType: 'all',
  officeType: 'all',
  budget: 'all',
};

function matchesBudget(item: FreeZoneDirectoryItem, budget: SetupDirectoryFilters['budget']) {
  if (budget === 'all') return true;
  if (budget === 'under_15000') return item.minCostMinor < 1_500_000;
  if (budget === '15000_25000') {
    return item.minCostMinor >= 1_500_000 && item.minCostMinor <= 2_500_000;
  }
  return item.minCostMinor > 2_500_000;
}

export function filterFreeZones(
  rows: readonly FreeZoneDirectoryItem[],
  filters: SetupDirectoryFilters,
): FreeZoneDirectoryItem[] {
  const query = filters.query.trim().toLocaleLowerCase('en');
  return rows.filter((item) => {
    const matchesQuery =
      query.length === 0 ||
      `${item.name} ${item.description} ${item.emirateLabel}`
        .toLocaleLowerCase('en')
        .includes(query);
    const matchesEmirate = filters.emirate === 'all' || item.emirate === filters.emirate;
    const matchesBusiness =
      filters.businessType === 'all' || item.businessTypes.includes(filters.businessType);
    const matchesOffice =
      filters.officeType === 'all' || item.officeTypes.includes(filters.officeType);
    return matchesQuery && matchesEmirate && matchesBusiness && matchesOffice && matchesBudget(item, filters.budget);
  });
}
