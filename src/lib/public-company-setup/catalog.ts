import { seededCostDataRows } from '@/lib/estimator/seed-data';
import { authoritySetupPages, getAuthorityPageBySlug } from '@/lib/knowledge-base';
import type {
  AuthorityDiscoveryCard,
  BusinessType,
  DiscoveryCard,
  EmirateKey,
  FreeZoneDirectoryItem,
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
  const baseRows = rows.filter((row) => row.feeType === 'license' || row.feeType === 'registration');
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

export const FREE_ZONE_DIRECTORY: readonly FreeZoneDirectoryItem[] = FREE_ZONE_PROFILES.map(
  freeZoneItem,
);

export const POPULAR_FREE_ZONES: readonly FreeZoneDirectoryItem[] = FREE_ZONE_DIRECTORY;

function offshoreAuthority(authority: 'RAK ICC' | 'Jebel Ali Offshore'): AuthorityDiscoveryCard {
  const page = authoritySetupPages.find((candidate) => candidate.authority === authority);
  if (!page || page.jurisdiction !== 'offshore') {
    throw new Error(`Missing accepted Offshore record for ${authority}`);
  }
  return {
    id: page.slug,
    name: authority,
    description: `${authority} estimate-grade planning record. Confirm structure suitability and current requirements before proceeding.`,
    href: `/company-setup/${page.slug}`,
    image: '/company-setup/offshore-hero.webp',
    authoritySlug: page.slug,
  };
}

export const OFFSHORE_OPTIONS: readonly AuthorityDiscoveryCard[] = [
  offshoreAuthority('RAK ICC'),
  offshoreAuthority('Jebel Ali Offshore'),
  {
    id: 'offshore-guidance',
    name: 'Other offshore structures',
    description:
      'Use the estimator to compare the available planning data, then confirm the appropriate jurisdiction with qualified advisers.',
    href: estimateHref('offshore'),
    image: '/company-setup/offshore-hero.webp',
    authoritySlug: null,
  },
];

export const PUBLIC_SETUP_CATALOG = {
  mainlandEmirates: MAINLAND_EMIRATES,
  popularFreeZones: POPULAR_FREE_ZONES,
  freeZoneDirectory: FREE_ZONE_DIRECTORY,
  offshoreOptions: OFFSHORE_OPTIONS,
  authorityDetailCount: authoritySetupPages.length,
  sampleAuthority: getAuthorityPageBySlug('dmcc'),
} as const;
