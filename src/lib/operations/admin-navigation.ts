import { z } from 'zod';

export type AdminCompanyOperationalModule = 'tasks' | 'notifications' | 'communications';

const companyIdSchema = z.string().uuid();

export function adminCompanyOperationalHref(
  companyId: string,
  module: AdminCompanyOperationalModule,
): string {
  const query = new URLSearchParams({ companyId: companyIdSchema.parse(companyId) });
  return `/admin/${module}?${query.toString()}`;
}
