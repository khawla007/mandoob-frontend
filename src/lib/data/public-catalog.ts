import 'server-only';

import { z } from 'zod';

export const PUBLIC_CATALOG_RESOURCES = ['authorities', 'activities', 'packages', 'costs'] as const;
export type PublicCatalogResource = (typeof PUBLIC_CATALOG_RESOURCES)[number];

export type PublicCatalogQueryInput = {
  page?: number | string | null;
  pageSize?: number | string | null;
  jurisdiction?: string | null;
  q?: string | null;
  authoritySlug?: string | null;
};

export type PublicCatalogQuery = {
  page: number;
  pageSize: number;
  jurisdiction: 'mainland' | 'free_zone' | 'offshore' | null;
  q: string | null;
  authoritySlug: string | null;
};

export type PublicCatalogVersion = {
  key: string;
  number: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  sourceCode: string;
};

export type PublicCatalogItem = {
  id: string;
  slug: string;
  name: string;
  jurisdiction: 'mainland' | 'free_zone' | 'offshore' | null;
  emirate: string | null;
  authoritySlug: string | null;
  category: string | null;
  priceState: 'priced' | 'on_request' | 'unavailable' | null;
  amountMinor: number | null;
  currency: 'AED' | null;
  recurrence: 'one_time' | 'annual' | null;
};

export type PublicCatalogResult =
  | {
      state: 'ready';
      items: PublicCatalogItem[];
      page: number;
      pageSize: number;
      total: number;
      version: PublicCatalogVersion;
    }
  | {
      state: 'unavailable';
      reason: 'not_populated' | 'source_unavailable' | 'invalid_source';
      retryable: boolean;
      items: [];
      page: number;
      pageSize: number;
      total: 0;
    };

export type PublicCatalogStore = {
  list(
    resource: PublicCatalogResource,
    query: PublicCatalogQuery,
  ): Promise<{ rows: unknown[]; count: number }>;
};

type Dependencies = { store?: PublicCatalogStore };
type CatalogDbRow = Record<string, unknown>;
type CatalogQueryResult = {
  data: unknown[] | null;
  error: unknown;
  count: number | null;
};
type CatalogQueryBuilder = PromiseLike<CatalogQueryResult> & {
  eq(column: string, value: unknown): CatalogQueryBuilder;
  or(filters: string): CatalogQueryBuilder;
  order(column: string, options: { ascending: boolean }): CatalogQueryBuilder;
  range(from: number, to: number): CatalogQueryBuilder;
};

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const publicRowSchema = z
  .object({
    id: z.string().uuid(),
    slug: z.string().regex(slugPattern),
    name: z.string().trim().min(1).max(200),
    jurisdiction: z.enum(['mainland', 'free_zone', 'offshore']).nullable().optional(),
    emirate: z.string().trim().max(100).nullable().optional(),
    authority_slug: z.string().regex(slugPattern).nullable().optional(),
    category: z.string().trim().max(160).nullable().optional(),
    price_state: z.enum(['priced', 'on_request', 'unavailable']).nullable().optional(),
    amount_minor: z.number().int().min(0).nullable().optional(),
    currency: z.literal('AED').nullable().optional(),
    recurrence: z.enum(['one_time', 'annual']).nullable().optional(),
    effective_from: z.string().regex(datePattern),
    effective_to: z.string().regex(datePattern).nullable(),
    version_key: z.string().trim().min(1).max(80),
    version_number: z.number().int().positive(),
    source_code: z.string().regex(slugPattern),
  })
  .superRefine((row, context) => {
    if (row.price_state === 'priced' && row.amount_minor === null) {
      context.addIssue({
        code: 'custom',
        path: ['amount_minor'],
        message: 'priced row needs amount',
      });
    }
    if (row.price_state && row.price_state !== 'priced' && row.amount_minor != null) {
      context.addIssue({
        code: 'custom',
        path: ['amount_minor'],
        message: 'non-priced row has amount',
      });
    }
  });

function boundedInteger(value: number | string | null | undefined, fallback: number, max: number) {
  const parsed = typeof value === 'string' ? Number(value) : value;
  if (!Number.isInteger(parsed) || Number(parsed) < 1) return fallback;
  return Math.min(Number(parsed), max);
}

function safeSlug(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLowerCase() ?? '';
  return slugPattern.test(normalized) ? normalized : null;
}

function safeSearch(value: string | null | undefined): string | null {
  const normalized = (value ?? '')
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/[%_,]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, ' ')
    .slice(0, 80)
    .trim();
  return normalized || null;
}

export function normalizePublicCatalogQuery(input: PublicCatalogQueryInput): PublicCatalogQuery {
  const jurisdiction = input.jurisdiction?.trim().toLowerCase();
  return {
    page: boundedInteger(input.page, 1, 10_000),
    pageSize: boundedInteger(input.pageSize, 24, 100),
    jurisdiction:
      jurisdiction === 'mainland' || jurisdiction === 'free_zone' || jurisdiction === 'offshore'
        ? jurisdiction
        : null,
    q: safeSearch(input.q),
    authoritySlug: safeSlug(input.authoritySlug),
  };
}

export function buildPublicCatalogCacheKey(
  resource: PublicCatalogResource,
  input: PublicCatalogQueryInput,
): string {
  const query = normalizePublicCatalogQuery(input);
  const params = new URLSearchParams();
  for (const key of ['authoritySlug', 'jurisdiction', 'page', 'pageSize', 'q'] as const) {
    const value = query[key];
    if (value !== null) params.set(key, String(value));
  }
  return `catalog:v1:${resource}:${params.toString()}`;
}

export function getPublicCatalogOrderColumns(
  resource: PublicCatalogResource,
): [string, string, string] {
  return resource === 'costs' ? ['authority', 'label', 'id'] : ['sort_order', 'slug', 'id'];
}

function mapPublicRow(value: unknown): { item: PublicCatalogItem; version: PublicCatalogVersion } {
  const parsed = publicRowSchema.parse(value);
  if (parsed.price_state === 'priced' && parsed.currency !== 'AED') {
    throw new Error('invalid catalog currency');
  }
  return {
    item: {
      id: parsed.id,
      slug: parsed.slug,
      name: parsed.name,
      jurisdiction: parsed.jurisdiction ?? null,
      emirate: parsed.emirate ?? null,
      authoritySlug: parsed.authority_slug ?? null,
      category: parsed.category ?? null,
      priceState: parsed.price_state ?? null,
      amountMinor: parsed.amount_minor ?? null,
      currency: parsed.currency ?? null,
      recurrence: parsed.recurrence ?? null,
    },
    version: {
      key: parsed.version_key,
      number: parsed.version_number,
      effectiveFrom: parsed.effective_from,
      effectiveTo: parsed.effective_to,
      sourceCode: parsed.source_code,
    },
  };
}

export async function listPublicCatalog(
  resource: PublicCatalogResource,
  input: PublicCatalogQueryInput = {},
  dependencies: Dependencies = {},
): Promise<PublicCatalogResult> {
  const query = normalizePublicCatalogQuery(input);
  try {
    const store = dependencies.store ?? (await createPublicCatalogStore());
    const { rows, count } = await store.list(resource, query);
    if (rows.length === 0) {
      return {
        state: 'unavailable',
        reason: 'not_populated',
        retryable: false,
        items: [],
        page: query.page,
        pageSize: query.pageSize,
        total: 0,
      };
    }
    const mapped = rows.map(mapPublicRow);
    const version = mapped[0].version;
    if (
      mapped.some(
        (entry) =>
          entry.version.key !== version.key ||
          entry.version.number !== version.number ||
          entry.version.sourceCode !== version.sourceCode,
      )
    ) {
      throw new Error('mixed public catalog versions');
    }
    return {
      state: 'ready',
      items: mapped.map((entry) => entry.item),
      page: query.page,
      pageSize: query.pageSize,
      total: Math.max(0, count),
      version,
    };
  } catch (error) {
    const invalid = error instanceof z.ZodError || error instanceof TypeError;
    console.warn('public_catalog_read_failed', {
      resource,
      reason: invalid ? 'invalid_source' : 'source_unavailable',
    });
    return {
      state: 'unavailable',
      reason: invalid ? 'invalid_source' : 'source_unavailable',
      retryable: !invalid,
      items: [],
      page: query.page,
      pageSize: query.pageSize,
      total: 0,
    };
  }
}

async function createPublicCatalogStore(): Promise<PublicCatalogStore> {
  const [{ createClient }, { env }] = await Promise.all([
    import('@supabase/supabase-js'),
    import('@/lib/env'),
  ]);
  const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  return {
    async list(resource, query) {
      const config = resourceConfig(resource);
      let builder = client
        .from(config.table)
        .select(config.select, { count: 'exact' }) as unknown as CatalogQueryBuilder;
      if (query.jurisdiction && config.jurisdictionColumn) {
        builder = builder.eq(config.jurisdictionColumn, query.jurisdiction);
      }
      if (query.authoritySlug && config.authorityColumn) {
        builder = builder.eq(config.authorityColumn, query.authoritySlug);
      }
      if (query.q) builder = builder.or(config.searchColumns(query.q));
      const from = (query.page - 1) * query.pageSize;
      const [primaryOrder, secondaryOrder, finalOrder] = getPublicCatalogOrderColumns(resource);
      const { data, error, count } = await builder
        .order(primaryOrder, { ascending: true })
        .order(secondaryOrder, { ascending: true })
        .order(finalOrder, { ascending: true })
        .range(from, from + query.pageSize - 1);
      if (error) throw new Error('catalog query failed');
      return { rows: ((data ?? []) as unknown[]).map(config.flatten), count: count ?? 0 };
    },
  };
}

function record(value: unknown): CatalogDbRow {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as CatalogDbRow) : {};
}

function firstRelation(value: unknown): CatalogDbRow {
  return record(Array.isArray(value) ? value[0] : value);
}

function relationVersion(value: CatalogDbRow) {
  const version = firstRelation(value.catalog_versions);
  const source = firstRelation(version.catalog_sources);
  return {
    version_key: version?.version_key,
    version_number: version?.version_number,
    effective_from: version?.effective_from,
    effective_to: version?.effective_to ?? null,
    source_code: source.code,
  };
}

function resourceConfig(resource: PublicCatalogResource) {
  const versionSelect =
    'catalog_versions!inner(version_key,version_number,effective_from,effective_to,catalog_sources!inner(code))';
  if (resource === 'authorities') {
    return {
      table: 'catalog_authorities',
      select: `id,slug,name,jurisdiction,emirate,sort_order,${versionSelect}`,
      sortColumn: 'sort_order',
      jurisdictionColumn: 'jurisdiction',
      authorityColumn: 'slug',
      searchColumns: (query: string) => `name.ilike.%${query}%,slug.ilike.%${query}%`,
      flatten: (value: unknown) => {
        const row = record(value);
        return { ...row, ...relationVersion(row) };
      },
    };
  }
  if (resource === 'activities') {
    return {
      table: 'catalog_activities',
      select: `id,slug,name,category,sort_order,${versionSelect}`,
      sortColumn: 'sort_order',
      jurisdictionColumn: null,
      authorityColumn: null,
      searchColumns: (query: string) => `name.ilike.%${query}%,slug.ilike.%${query}%`,
      flatten: (value: unknown) => {
        const row = record(value);
        return { ...row, ...relationVersion(row) };
      },
    };
  }
  if (resource === 'packages') {
    return {
      table: 'catalog_packages',
      select: `id,slug,name,sort_order,catalog_authorities!inner(slug,jurisdiction),catalog_package_prices(price_state,amount_minor,currency,recurrence,effective_from,effective_to,sort_order),${versionSelect}`,
      sortColumn: 'sort_order',
      jurisdictionColumn: 'catalog_authorities.jurisdiction',
      authorityColumn: 'catalog_authorities.slug',
      searchColumns: (query: string) => `name.ilike.%${query}%,slug.ilike.%${query}%`,
      flatten: (value: unknown) => {
        const row = record(value);
        const authority = firstRelation(row.catalog_authorities);
        const prices = Array.isArray(row.catalog_package_prices)
          ? row.catalog_package_prices.map(record)
          : [];
        const price = prices.toSorted(
          (a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0),
        )[0];
        return {
          ...row,
          jurisdiction: authority.jurisdiction,
          authority_slug: authority.slug,
          price_state: price?.price_state ?? 'unavailable',
          amount_minor: price?.amount_minor ?? null,
          currency: price?.currency ?? null,
          recurrence: price?.recurrence ?? null,
          ...relationVersion(row),
        };
      },
    };
  }
  return {
    table: 'cost_data',
    select: `id,label,authority,fee_type,amount_minor,currency,recurrence,valid_from,valid_to,catalog_authorities!inner(slug,jurisdiction),catalog_versions!inner(version_key,version_number,effective_from,effective_to,catalog_sources!inner(code))`,
    sortColumn: 'authority',
    jurisdictionColumn: 'catalog_authorities.jurisdiction',
    authorityColumn: 'catalog_authorities.slug',
    searchColumns: (query: string) => `label.ilike.%${query}%,authority.ilike.%${query}%`,
    flatten: (value: unknown) => {
      const row = record(value);
      const authority = firstRelation(row.catalog_authorities);
      return {
        ...row,
        jurisdiction: authority.jurisdiction,
        slug: `${String(row.authority)
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')}-${String(row.fee_type)
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')}`.replace(/^-|-$/g, ''),
        name: row.label,
        authority_slug: authority.slug,
        price_state: 'priced',
        ...relationVersion(row),
      };
    },
  };
}
