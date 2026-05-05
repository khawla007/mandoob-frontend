import type { RenewalStatus, RenewalType } from '@/lib/data/renewals';

export const RENEWAL_TYPE_LABEL: Record<RenewalType, string> = {
  license: 'License',
  visa: 'Visa',
  eid: 'EID',
  ejari: 'Ejari',
};

export const RENEWAL_STATUS_LABEL: Record<RenewalStatus, string> = {
  upcoming: 'Upcoming',
  due_soon: 'Due soon',
  overdue: 'Overdue',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export const RENEWAL_STATUS_VARIANT: Record<
  RenewalStatus,
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  upcoming: 'secondary',
  due_soon: 'secondary',
  overdue: 'destructive',
  completed: 'default',
  cancelled: 'outline',
};
