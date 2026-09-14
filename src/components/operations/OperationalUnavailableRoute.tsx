import { getTranslations } from 'next-intl/server';

import { OperationalUnavailableWorkspace } from './OperationalUnavailableWorkspace';
import { parseCalendarSearch, parseTaskSearch } from '@/lib/operations/query';

export type OperationalUnavailableModule =
  | 'tasks'
  | 'calendar'
  | 'communications'
  | 'notifications'
  | 'activity'
  | 'meetings';
export type OperationalRole = 'admin' | 'pro' | 'customer' | 'employee';
type Search = Record<string, string | string[] | undefined>;

export async function OperationalUnavailableRoute({
  role,
  module,
  baseHref,
  search = {},
}: {
  role: OperationalRole;
  module: OperationalUnavailableModule;
  baseHref: string;
  search?: Search;
}) {
  const t = await getTranslations('operations');
  const displayFilterValue = (label: string, value: string | number | null) => {
    if (value === null) return t('filters.notSet');
    if (label === 'date' || label === 'page') return String(value);
    return t(`filterValues.${value}`);
  };
  const filters =
    module === 'tasks'
      ? Object.entries(parseTaskSearch(search)).map(([label, value]) => ({
          label: t(`filters.${label}`),
          value: displayFilterValue(label, value),
        }))
      : module === 'calendar'
        ? Object.entries(parseCalendarSearch(search)).map(([label, value]) => ({
            label: t(`filters.${label}`),
            value: displayFilterValue(label, value),
          }))
        : [];

  return (
    <OperationalUnavailableWorkspace
      resetHref={baseHref}
      filters={filters}
      copy={{
        eyebrow: t('eyebrow', { scope: t(`roles.${role}`) }),
        title: t(`modules.${module}.title`),
        description: t(`modules.${module}.description`, { scope: t(`roles.${role}`) }),
        sourceLabel: t('summary.source'),
        sourceValue: t(`modules.${module}.source`),
        scopeLabel: t('summary.scope'),
        scopeValue: t(`scopes.${role}`),
        ownerLabel: t('summary.owner'),
        ownerValue: t('phase3'),
        unavailableTitle: t('unavailableTitle'),
        unavailableDescription: t(`modules.${module}.unavailable`),
        listTitle: t('boundariesTitle'),
        listDescription: t('boundariesDescription'),
        boundaries: [
          t(`modules.${module}.boundaries.0`),
          t(`modules.${module}.boundaries.1`),
          t(`modules.${module}.boundaries.2`),
        ],
        filtersLabel: t('filters.label'),
        resetLabel: t('filters.reset'),
      }}
    />
  );
}
