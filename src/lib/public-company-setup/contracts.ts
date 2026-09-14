export type SetupJurisdiction = 'mainland' | 'free_zone' | 'offshore';

export type EmirateKey =
  | 'dubai'
  | 'abu_dhabi'
  | 'sharjah'
  | 'ajman'
  | 'ras_al_khaimah'
  | 'fujairah'
  | 'umm_al_quwain';

export type BusinessType = 'commercial' | 'professional' | 'industrial' | 'creative';
export type OfficeTypeFilter = 'all' | 'flexi' | 'physical';
export type BudgetFilter = 'all' | 'under_15000' | '15000_25000' | 'over_25000';

export type SetupDirectoryFilters = {
  query: string;
  emirate: 'all' | EmirateKey;
  businessType: 'all' | BusinessType;
  officeType: OfficeTypeFilter;
  budget: BudgetFilter;
};

export type DiscoveryCard = {
  id: string;
  name: string;
  description: string;
  href: string;
  image: string;
};

export type AuthorityDiscoveryCard = DiscoveryCard & {
  authoritySlug: string | null;
};

export type FreeZoneDirectoryItem = AuthorityDiscoveryCard & {
  emirate: EmirateKey;
  emirateLabel: string;
  businessTypes: readonly BusinessType[];
  officeTypes: readonly Exclude<OfficeTypeFilter, 'all'>[];
  minCostMinor: number;
  maxCostMinor: number;
  costLabel: string;
  timelineLabel: string;
};
