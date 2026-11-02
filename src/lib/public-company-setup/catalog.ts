import { seededCostDataRows } from '@/lib/estimator/seed-data';
import { authoritySetupPages, getAuthorityPageBySlug } from '@/lib/knowledge-base';
import type {
  BusinessType,
  DiscoveryCard,
  EmirateKey,
  FreeZoneDirectoryItem,
  OffshoreOptionCard,
} from './contracts';

const aed = new Intl.NumberFormat('en-AE', { maximumFractionDigits: 0 });

export function formatIndicativeAed(minMinor: number, maxMinor: number): string {
  return `Indicative AED ${aed.format(minMinor / 100)}–${aed.format(maxMinor / 100)}`;
}

function estimateHref(jurisdiction: 'mainland' | 'free_zone' | 'offshore', emirate?: string) {
  const params = new URLSearchParams({ jurisdiction });
  if (emirate) params.set('emirate', emirate);
  return `/estimate?${params.toString()}`;
}

export const MAINLAND_EMIRATES: readonly DiscoveryCard[] = [
  ['dubai', 'Dubai', 'UAE market access and a broad activity catalog.'],
  ['abu_dhabi', 'Abu Dhabi', 'A major commercial base with authority-specific requirements.'],
  ['sharjah', 'Sharjah', 'A practical setup path for varied operating models.'],
  ['ajman', 'Ajman', 'A compact emirate option with case-dependent requirements.'],
  ['ras_al_khaimah', 'Ras Al Khaimah', 'An operating base serving varied business activities.'],
  ['fujairah', 'Fujairah', 'An east-coast location with activity-specific considerations.'],
  ['umm_al_quwain', 'Umm Al Quwain', 'A northern-emirate option for suitable activities.'],
].map(([id, name, description]) => ({
  id,
  name,
  description,
  href: estimateHref('mainland', id),
  image: '/company-setup/emirates-grid.webp',
}));

const FREE_ZONE_PROFILES: ReadonlyArray<{
  name: string;
  businessTypes: readonly BusinessType[];
  description: string;
}> = [
  {
    name: 'DMCC',
    businessTypes: ['commercial', 'professional', 'industrial'],
    description: 'Dubai authority record for commodities, trade, and service planning.',
  },
  {
    name: 'JAFZA',
    businessTypes: ['commercial', 'industrial'],
    description: 'Dubai authority record for logistics, trading, and industrial planning.',
  },
  {
    name: 'IFZA',
    businessTypes: ['commercial', 'professional'],
    description: 'Dubai authority record for service and commercial planning.',
  },
  {
    name: 'RAKEZ',
    businessTypes: ['commercial', 'professional', 'industrial'],
    description: 'Ras Al Khaimah authority record for varied activity planning.',
  },
  {
    name: 'SHAMS',
    businessTypes: ['professional', 'creative'],
    description: 'Sharjah authority record for media and creative planning.',
  },
  {
    name: 'Meydan Free Zone',
    businessTypes: ['commercial', 'professional'],
    description: 'Dubai authority record for commercial and service planning.',
  },
];

function freeZoneItem(profile: (typeof FREE_ZONE_PROFILES)[number]): FreeZoneDirectoryItem {
  const page = authoritySetupPages.find((candidate) => candidate.authority === profile.name);
  if (!page || page.jurisdiction !== 'free_zone' || !page.emirate) {
    throw new Error(`Missing accepted Free Zone record for ${profile.name}`);
  }
  const rows = seededCostDataRows.filter((row) => row.authority === profile.name);
  const baseRows = rows.filter(
    (row) => row.feeType === 'license' || row.feeType === 'registration',
  );
  const officeRows = rows.filter((row) => row.feeType.startsWith('office_'));
  const minCostMinor = baseRows.reduce((total, row) => total + row.amountMinor, 0);
  const maxCostMinor = minCostMinor + officeRows.reduce((total, row) => total + row.amountMinor, 0);
  const emirate = page.emirate as EmirateKey;
  const emirateLabel = emirate
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

  return {
    id: page.slug,
    name: profile.name,
    description: profile.description,
    href: `/company-setup/${page.slug}`,
    image: '/company-setup/free-zones-grid.webp',
    authoritySlug: page.slug,
    emirate,
    emirateLabel,
    businessTypes: profile.businessTypes,
    officeTypes: ['flexi'],
    minCostMinor,
    maxCostMinor,
    costLabel: formatIndicativeAed(minCostMinor, maxCostMinor),
    timelineLabel: `${page.timelineDays.min}–${page.timelineDays.max} indicative days`,
  };
}

export const FREE_ZONE_DIRECTORY: readonly FreeZoneDirectoryItem[] =
  FREE_ZONE_PROFILES.map(freeZoneItem);

export const POPULAR_FREE_ZONES: readonly FreeZoneDirectoryItem[] = FREE_ZONE_DIRECTORY;

function offshoreAuthority(authority: 'RAK ICC' | 'Jebel Ali Offshore'): OffshoreOptionCard {
  const page = authoritySetupPages.find((candidate) => candidate.authority === authority);
  if (!page || page.jurisdiction !== 'offshore') {
    throw new Error(`Missing accepted Offshore record for ${authority}`);
  }
  const rows = offshoreRows(authority);
  const base = sumMinor(rows, BASE_FEE_TYPES);
  const days = sumDays(rows, BASE_FEE_TYPES);
  const regionLabel = page.emirate ? titleCase(page.emirate) : 'UAE';
  return {
    id: page.slug,
    name: authority,
    description: `${authority} estimate-grade planning record. Confirm structure suitability and current requirements before proceeding.`,
    href: `/company-setup/${page.slug}`,
    image: '/company-setup/offshore-hero.webp',
    authoritySlug: page.slug,
    monogram: monogramFor(authority),
    regionLabel: `${regionLabel} authority record`,
    highlights: [
      `Base components from AED ${aed.format(base / 100)}`,
      `${days.min}–${days.max} indicative working days`,
      'No office package in the base estimate',
      'Passport copy and photograph for base filing',
      'Suitability confirmed with qualified advisers',
    ],
  };
}

const OFFSHORE_AUTHORITIES = ['RAK ICC', 'Jebel Ali Offshore'] as const;
const BASE_FEE_TYPES = ['license', 'registration'] as const;

function offshoreRows(authority: string) {
  return seededCostDataRows.filter(
    (row) => row.authority === authority && row.jurisdiction === 'offshore',
  );
}

function sumMinor(rows: typeof seededCostDataRows, feeTypes: readonly string[]): number {
  return rows
    .filter((row) => feeTypes.includes(row.feeType))
    .reduce((total, row) => total + row.amountMinor, 0);
}

function sumDays(rows: typeof seededCostDataRows, feeTypes: readonly string[]) {
  const selected = rows.filter((row) => feeTypes.includes(row.feeType));
  return {
    min: selected.reduce((total, row) => total + row.timelineMinDays, 0),
    max: selected.reduce((total, row) => total + row.timelineMaxDays, 0),
  };
}

function titleCase(key: string): string {
  return key
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function monogramFor(name: string): string {
  const words = name.split(/\s+/u).filter(Boolean);
  // Acronym-led names (e.g. "RAK ICC") keep their leading acronym.
  if (/^[A-Z]{2,4}$/u.test(words[0])) return words[0];
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
  return words
    .map((word) => word.charAt(0))
    .join('')
    .slice(0, 3)
    .toUpperCase();
}

export const OFFSHORE_OPTIONS: readonly OffshoreOptionCard[] = [
  ...OFFSHORE_AUTHORITIES.map(offshoreAuthority),
  {
    id: 'offshore-guidance',
    name: 'Other offshore structures',
    description:
      'Use the estimator to compare the available planning data, then confirm the appropriate jurisdiction with qualified advisers.',
    href: estimateHref('offshore'),
    image: '/company-setup/offshore-hero.webp',
    authoritySlug: null,
    monogram: 'UAE',
    regionLabel: 'Guided comparison',
    highlights: [
      'Compare accepted offshore planning data',
      'Itemised, indicative cost components',
      'Purpose and ownership reviewed first',
      'Legal and tax advice obtained separately',
      'PRO support once a route is chosen',
    ],
  },
];

type OffshoreRange = { minMinor: number; maxMinor: number };

function rangeFor(feeType: string): OffshoreRange {
  const amounts = OFFSHORE_AUTHORITIES.map((authority) =>
    sumMinor(offshoreRows(authority), [feeType]),
  );
  return { minMinor: Math.min(...amounts), maxMinor: Math.max(...amounts) };
}

function daysFor(feeType: string) {
  const ranges = OFFSHORE_AUTHORITIES.map((authority) =>
    sumDays(offshoreRows(authority), [feeType]),
  );
  return {
    min: Math.min(...ranges.map((range) => range.min)),
    max: Math.max(...ranges.map((range) => range.max)),
  };
}

export function formatAedRange({ minMinor, maxMinor }: OffshoreRange): string {
  return minMinor === maxMinor
    ? `AED ${aed.format(minMinor / 100)}`
    : `AED ${aed.format(minMinor / 100)}–${aed.format(maxMinor / 100)}`;
}

function formatDays({ min, max }: { min: number; max: number }): string {
  return `${min}–${max} days`;
}

const offshoreBaseTotals = OFFSHORE_AUTHORITIES.map((authority) => {
  const rows = offshoreRows(authority);
  return { minor: sumMinor(rows, BASE_FEE_TYPES), days: sumDays(rows, BASE_FEE_TYPES) };
});

/**
 * Offshore planning summary derived from the estimate-grade seed rows for the accepted
 * offshore authorities. Visa rows are excluded: offshore structures do not sponsor visas.
 */
export const OFFSHORE_PLANNING = {
  baseRange: {
    minMinor: Math.min(...offshoreBaseTotals.map((total) => total.minor)),
    maxMinor: Math.max(...offshoreBaseTotals.map((total) => total.minor)),
  },
  baseTimeline: {
    min: Math.min(...offshoreBaseTotals.map((total) => total.days.min)),
    max: Math.max(...offshoreBaseTotals.map((total) => total.days.max)),
  },
  fees: [
    { label: 'Authority license (annual)', ...rangeFor('license'), optional: false },
    { label: 'Registration (one-time)', ...rangeFor('registration'), optional: false },
    { label: 'Additional shareholder file', ...rangeFor('shareholder'), optional: true },
    {
      label: 'Document attestation, if needed',
      ...rangeFor('addon_document_attestation'),
      optional: true,
    },
    { label: 'Bank account assistance', ...rangeFor('addon_bank_account'), optional: true },
  ],
  timeline: [
    { label: 'Registration filing', range: formatDays(daysFor('registration')), optional: false },
    { label: 'License issuance', range: formatDays(daysFor('license')), optional: false },
    {
      label: 'Document attestation, if needed',
      range: formatDays(daysFor('addon_document_attestation')),
      optional: true,
    },
    {
      label: 'Bank account assistance',
      range: formatDays(daysFor('addon_bank_account')),
      optional: true,
    },
  ],
} as const;

export const PUBLIC_SETUP_CATALOG = {
  mainlandEmirates: MAINLAND_EMIRATES,
  popularFreeZones: POPULAR_FREE_ZONES,
  freeZoneDirectory: FREE_ZONE_DIRECTORY,
  offshoreOptions: OFFSHORE_OPTIONS,
  authorityDetailCount: authoritySetupPages.length,
  sampleAuthority: getAuthorityPageBySlug('dmcc'),
} as const;
