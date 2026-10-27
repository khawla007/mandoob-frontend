import { UUID_RE } from '@/lib/util/uuid';
import { adminRegistrationHref, type AdminRegistrationQuery } from './admin-query';
import type { AdminRegistrationIndexQueryInput } from '@/lib/validation/registration-workflow';

// Map the page's URL query (free-text company/PRO filters + an 'all' sentinel
// for stage/status) onto the RPC index contract: company/pro are nullable uuid
// filters, stage/status are nullable enums. A free-text company/PRO filter that
// is not a valid uuid is dropped (the RPC filters by identifier, not label), so
// a non-uuid filter simply yields the unfiltered page rather than leaking a
// scan. Page is passed through; the Zod schema clamps it to 1..10000.
export function buildAdminRegistrationIndexQuery(
  query: AdminRegistrationQuery,
): AdminRegistrationIndexQueryInput {
  return {
    company: query.company && UUID_RE.test(query.company) ? query.company : null,
    pro: query.pro && UUID_RE.test(query.pro) ? query.pro : null,
    stage: query.stage === 'all' ? null : query.stage,
    status: query.status === 'all' ? null : query.status,
    page: query.page,
  };
}

// Previous/next hrefs for the admin index. Previous exists whenever the page is
// past the first; next exists only when the server reports more rows beyond the
// current page window (page * pageSize < total). Filters are preserved.
export function adminRegistrationPagination(
  query: AdminRegistrationQuery,
  window: { total: number; page: number; pageSize: number } | null,
): { previous: string | null; next: string | null } {
  const previous =
    query.page > 1 ? adminRegistrationHref({ ...query, page: query.page - 1 }) : null;
  const next =
    window && window.page * window.pageSize < window.total
      ? adminRegistrationHref({ ...query, page: query.page + 1 })
      : null;
  return { previous, next };
}
